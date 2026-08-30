/**
 * Katkıda bulunan etkisi.
 * Kaynak: exc_analyzer/commands/contrib_impact.py
 *
 * Puan = eklenen satır × 0.7 − silinen satır × 0.3
 * Silme tamamen cezalandırılmıyor; temizlik de katkıdır, ama eklemek kadar
 * ağırlık taşımaz.
 */
import { GitHubClient } from '../lib/github';

export interface ContributorImpact {
  login: string;
  avatarUrl: string | null;
  score: number;
  additions: number;
  deletions: number;
}

export interface ContribImpactResult {
  owner: string;
  repo: string;
  contributors: ContributorImpact[];
  /** GitHub istatistikleri hesaplarken 202 döner; o durumda liste boş gelir. */
  statsPending: boolean;
}

interface StatsContributor {
  author: { login: string; avatar_url?: string } | null;
  weeks: { a: number; d: number }[];
}

export async function contribImpact(
  gh: GitHubClient,
  owner: string,
  repo: string,
): Promise<ContribImpactResult> {
  // GitHub bu istatistikleri arka planda hesaplar ve hazir degilse 202 doner.
  // Birkac kez, artan araliklarla tekrar deniyoruz.
  //
  // Bunun calismasi github.ts'teki onbellegin 202'yi SAKLAMAMASINA bagli:
  // saklasaydi her tekrar deneme ayni onbellek kaydini okur ve dongu bosa
  // calisirdi.
  let data: StatsContributor[] | null = null;
  let pending = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await gh.raw<StatsContributor[]>(`/repos/${owner}/${repo}/stats/contributors`);
    if (res.status === 200 && Array.isArray(res.data)) {
      data = res.data;
      break;
    }
    if (res.status === 202) {
      pending = true;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      continue;
    }
    break;
  }

  if (!data) {
    return { owner, repo, contributors: [], statsPending: pending };
  }

  const contributors = data
    .filter((c) => c.author)
    .map((c) => {
      const additions = c.weeks.reduce((sum, w) => sum + (w.a ?? 0), 0);
      const deletions = c.weeks.reduce((sum, w) => sum + (w.d ?? 0), 0);
      return {
        login: c.author!.login,
        avatarUrl: c.author!.avatar_url ?? null,
        score: additions * 0.7 - deletions * 0.3,
        additions,
        deletions,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return { owner, repo, contributors, statsPending: false };
}
