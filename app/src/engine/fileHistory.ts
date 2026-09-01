import { GitHubClient } from '../lib/github';
export interface FileCommit {
  sha: string;
  date: string;
  author: string;
  message: string;
  url: string;
}
export interface FileHistoryResult {
  owner: string;
  repo: string;
  path: string;
  commits: FileCommit[];
}
interface CommitItem {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } | null };
}
const MAX_LIMIT = 50;
export async function fileHistory(
  gh: GitHubClient,
  owner: string,
  repo: string,
  filepath: string,
  limit = 20,
): Promise<FileHistoryResult> {
  if (limit > MAX_LIMIT) {
    throw new Error(`At most ${MAX_LIMIT} entries can be requested.`);
  }
  const path = filepath.trim();
  const commits = await gh.get<CommitItem[]>(`/repos/${owner}/${repo}/commits`, {
    path,
    per_page: limit,
  });

  return {
    owner,
    repo,
    path,
    commits: commits.slice(0, limit).map((c) => ({
      sha: c.sha.slice(0, 7),
      date: c.commit.author?.date ?? '',
      author: c.commit.author?.name ?? 'unknown',
      message: (c.commit.message ?? '').split('\n')[0],
      url: c.html_url,
    })),
  };
}