/**
 * Kullanıcı davranış anomalisi ve risk puanı.
 * Kaynak: exc_analyzer/commands/user_anomaly.py
 *
 * Buradaki bulgular birer İŞARETtir, suçlama değil. Yüksek puan "bu hesap
 * kötü niyetli" demek değil, "bu hesabın davranışı olağandışı, bakmaya değer"
 * demektir. Arayüz de bu dili kullanır.
 */
import { GitHubClient } from '../lib/github';

export type AnomalyLevel = 'warning' | 'info';

export interface Anomaly {
  level: AnomalyLevel;
  message: string;
}

export interface UserAnomalyResult {
  login: string;
  avatarUrl: string | null;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  anomalies: Anomaly[];
  accountAgeDays: number | null;
  publicRepos: number;
  followers: number;
  following: number;
  forkCount: number;
  repoCount: number;
  /** 6 saatlik dilimlere göre etkinlik dağılımı. */
  activityBlocks: { label: string; count: number }[];
  eventsAnalyzed: number;
}

interface UserData {
  login: string;
  avatar_url: string | null;
  created_at: string;
  public_repos: number;
  followers: number;
  following: number;
  name: string | null;
  bio: string | null;
  location: string | null;
  email: string | null;
  blog: string | null;
}

interface EventData {
  type?: string;
  created_at?: string;
  payload?: { commits?: { message?: string }[] };
}

interface RepoData {
  name: string;
  fork: boolean;
  language: string | null;
  size: number;
}

export async function userAnomaly(
  gh: GitHubClient,
  username: string,
): Promise<UserAnomalyResult> {
  const [user, events, repos] = await Promise.all([
    gh.get<UserData>(`/users/${username}`),
    gh.raw<EventData[]>(`/users/${username}/events/public`, { per_page: 100 }).then(
      (r) => (Array.isArray(r.data) ? r.data : []),
    ),
    gh.raw<RepoData[]>(`/users/${username}/repos`, { per_page: 100 }).then(
      (r) => (Array.isArray(r.data) ? r.data : []),
    ),
  ]);

  const anomalies: Anomaly[] = [];
  let risk = 0;

  const ageDays = user.created_at
    ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86_400_000)
    : null;

  if (ageDays !== null) {
    if (ageDays < 30 && user.public_repos > 10) {
      anomalies.push({
        level: 'warning',
        message: `Hesap ${ageDays} günlük ama ${user.public_repos} herkese açık deposu var.`,
      });
      risk += 20;
    }
    if (ageDays > 365 && user.public_repos === 0 && events.length === 0) {
      anomalies.push({
        level: 'info',
        message: 'Bir yıldan eski hesap, hiç herkese açık depo ve etkinlik yok.',
      });
      risk += 10;
    }
  }

  if (user.following > 1000 && user.followers / user.following < 0.1) {
    anomalies.push({
      level: 'warning',
      message: `Takip dengesi olağandışı: ${user.followers} takipçi, ${user.following} takip edilen.`,
    });
    risk += 25;
  }

  const forkCount = repos.filter((r) => r.fork).length;
  if (repos.length > 5 && forkCount / repos.length > 0.8) {
    anomalies.push({
      level: 'warning',
      message: `Depoların %${Math.round((forkCount / repos.length) * 100)}’i fork (${forkCount}/${repos.length}).`,
    });
    risk += 15;
  }

  const hours = events
    .map((e) => (e.created_at ? Number(e.created_at.slice(11, 13)) : NaN))
    .filter((h) => !Number.isNaN(h));

  if (hours.length > 10) {
    const hourCounts = new Map<number, number>();
    for (const h of hours) hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);

    const [topHour, topCount] = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCount > hours.length * 0.5) {
      anomalies.push({
        level: 'warning',
        message: `Etkinliğin ${topCount} tanesi tek bir saatte (${String(topHour).padStart(2, '0')}:00) toplanmış.`,
      });
      risk += 15;
    }

    const night = [0, 1, 2, 3, 4, 5].reduce((sum, h) => sum + (hourCounts.get(h) ?? 0), 0);
    if (night > hours.length * 0.7) {
      anomalies.push({
        level: 'info',
        message: `Etkinliğin %${Math.round((night / hours.length) * 100)}’i gece 00–06 arasında.`,
      });
      risk += 5;
    }
  }

  const profileScore = [user.name, user.bio, user.location, user.email, user.blog].filter(
    Boolean,
  ).length;
  if (profileScore <= 1 && (user.followers > 100 || user.public_repos > 10)) {
    anomalies.push({
      level: 'info',
      message: 'Etkin bir hesaba göre profil bilgileri neredeyse boş.',
    });
    risk += 10;
  }

  if (events.length > 20) {
    const typeCounts = new Map<string, number>();
    for (const e of events) {
      const type = e.type ?? 'Unknown';
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    }
    const [topType, topTypeCount] = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topTypeCount > events.length * 0.9) {
      anomalies.push({
        level: 'warning',
        message: `Etkinliğin %${Math.round((topTypeCount / events.length) * 100)}’i tek tip (${topType}).`,
      });
      risk += 20;
    }

    const dayCounts = new Map<string, number>();
    for (const e of events) {
      const day = e.created_at?.slice(0, 10);
      if (day) dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    }
    if (dayCounts.size > 0) {
      const values = [...dayCounts.values()];
      const max = Math.max(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      if (avg > 1 && max > avg * 5) {
        anomalies.push({
          level: 'info',
          message: `Bir günde ${max} etkinlik, günlük ortalama ${Math.round(avg)}.`,
        });
        risk += 10;
      }
    }
  }

  const commitMessages = events
    .filter((e) => e.type === 'PushEvent')
    .flatMap((e) => e.payload?.commits ?? [])
    .map((c) => c.message ?? '')
    .filter(Boolean);
  if (commitMessages.length > 10) {
    const shortOnes = commitMessages.filter((m) => m.trim().split(/\s+/).length <= 2).length;
    if (shortOnes > commitMessages.length * 0.7) {
      anomalies.push({
        level: 'warning',
        message: `Commit mesajlarının %${Math.round((shortOnes / commitMessages.length) * 100)}’i iki kelimeden kısa.`,
      });
      risk += 15;
    }
  }

  if (repos.length > 5) {
    const randomish = repos.filter((r) => {
      const n = r.name.toLowerCase();
      return /^[a-z]{8,}\d+$/.test(n) || /^repo-?\d+$/.test(n) || /^test-?\d+$/.test(n);
    }).length;
    if (randomish > repos.length * 0.5) {
      anomalies.push({
        level: 'warning',
        message: `${randomish}/${repos.length} deponun adı otomatik üretilmiş gibi görünüyor.`,
      });
      risk += 20;
    }

    const empty = repos.filter((r) => (r.size ?? 0) < 10).length;
    if (empty > repos.length * 0.7) {
      anomalies.push({
        level: 'warning',
        message: `Depoların ${empty}/${repos.length} tanesi neredeyse boş.`,
      });
      risk += 15;
    }

    const langs = repos.map((r) => r.language).filter(Boolean) as string[];
    if (langs.length > 10) {
      const counts = new Map<string, number>();
      for (const l of langs) counts.set(l, (counts.get(l) ?? 0) + 1);
      const [topLang, topLangCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (topLangCount > langs.length * 0.9) {
        anomalies.push({
          level: 'info',
          message: `Depoların %${Math.round((topLangCount / langs.length) * 100)}’i tek dilde (${topLang}).`,
        });
      }
    }
  }

  const score = Math.min(risk, 100);

  const blockOf = (from: number, to: number) =>
    hours.filter((h) => h >= from && h < to).length;

  return {
    login: user.login,
    avatarUrl: user.avatar_url,
    riskScore: score,
    riskLevel: score < 30 ? 'low' : score < 60 ? 'medium' : 'high',
    anomalies,
    accountAgeDays: ageDays,
    publicRepos: user.public_repos,
    followers: user.followers,
    following: user.following,
    forkCount,
    repoCount: repos.length,
    activityBlocks: [
      { label: '00–06', count: blockOf(0, 6) },
      { label: '06–12', count: blockOf(6, 12) },
      { label: '12–18', count: blockOf(12, 18) },
      { label: '18–24', count: blockOf(18, 24) },
    ],
    eventsAnalyzed: events.length,
  };
}
