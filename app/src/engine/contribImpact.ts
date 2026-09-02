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

  let data: StatsContributor[] | null = null;
  let pending = false;
  const waits = [1000, 2000, 3000, 4000, 5000];
  for (let attempt = 0; attempt <= waits.length; attempt += 1) {
    const res = await gh.raw<StatsContributor[]>(`/repos/${owner}/${repo}/stats/contributors`);
    if (res.status === 200 && Array.isArray(res.data)) {
      data = res.data;
      pending = false;
      break;
    }
    if (res.status === 202 && attempt < waits.length) {
      pending = true;
      await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
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