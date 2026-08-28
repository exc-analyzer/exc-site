/**
 * Commit mesajı anomali tespiti.
 * Kaynak: exc_analyzer/commands/commit_anomaly.py
 *
 * Şüpheli kelime geçen commit'leri işaretler. Bu bir kanıt değil, bir işarettir:
 * "temp" yazan her commit sorunlu değildir, ama incelemeye değer.
 */
import { GitHubClient } from '../lib/github';

export interface RiskyCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
  matched: string[];
}

export interface CommitAnomalyResult {
  owner: string;
  repo: string;
  scannedCount: number;
  risky: RiskyCommit[];
}

const SUSPICIOUS = [
  'fix bug',
  'temp',
  'test',
  'remove security',
  'debug',
  'hack',
  'bypass',
  'password',
  'secret',
];

interface CommitItem {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
}

export async function commitAnomaly(
  gh: GitHubClient,
  owner: string,
  repo: string,
  limit = 30,
): Promise<CommitAnomalyResult> {
  const commits = await gh.get<CommitItem[]>(`/repos/${owner}/${repo}/commits`, {
    per_page: Math.min(limit, 100),
  });

  const risky: RiskyCommit[] = [];
  for (const c of commits) {
    const message = c.commit.message ?? '';
    const lower = message.toLowerCase();
    const matched = SUSPICIOUS.filter((word) => lower.includes(word));
    if (matched.length === 0) continue;

    risky.push({
      sha: c.sha.slice(0, 7),
      message: message.split('\n')[0],
      author: c.commit.author?.name ?? 'anonim',
      date: c.commit.author?.date ?? '',
      url: c.html_url,
      matched,
    });
  }

  return { owner, repo, scannedCount: commits.length, risky };
}
