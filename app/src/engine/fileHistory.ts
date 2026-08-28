/**
 * Dosya değişim geçmişi.
 * Kaynak: exc_analyzer/commands/file_history.py
 *
 * Yol verilmezse (yalnızca dosya adı yazılmışsa) kod aramasıyla depo içinde
 * dosyanın yeri bulunur.
 */
import { GitHubClient, NotFoundError } from '../lib/github';

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
  /** Yol arama ile bulunduysa true; kullanıcıya nerede bulunduğunu söyleriz. */
  pathWasSearched: boolean;
  commits: FileCommit[];
}

interface CommitItem {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } | null };
}

const MAX_LIMIT = 50;

async function findPath(
  gh: GitHubClient,
  owner: string,
  repo: string,
  filename: string,
): Promise<string | null> {
  const res = await gh.raw<{ total_count: number; items: { path: string }[] }>(
    '/search/code',
    { q: `filename:${filename} repo:${owner}/${repo}` },
  );
  if (res.status !== 200 || !res.data?.items?.length) return null;
  return res.data.items[0].path;
}

export async function fileHistory(
  gh: GitHubClient,
  owner: string,
  repo: string,
  filepath: string,
  limit = 20,
): Promise<FileHistoryResult> {
  if (limit > MAX_LIMIT) {
    throw new Error(`En fazla ${MAX_LIMIT} kayıt istenebilir.`);
  }

  let path = filepath.trim();
  let searched = false;

  if (!path.includes('/')) {
    const found = await findPath(gh, owner, repo, path);
    if (!found) {
      throw new NotFoundError(`"${path}" bu depoda bulunamadı.`);
    }
    path = found;
    searched = true;
  }

  const commits = await gh.get<CommitItem[]>(`/repos/${owner}/${repo}/commits`, {
    path,
    per_page: limit,
  });

  return {
    owner,
    repo,
    path,
    pathWasSearched: searched,
    commits: commits.slice(0, limit).map((c) => ({
      sha: c.sha.slice(0, 7),
      date: c.commit.author?.date ?? '',
      author: c.commit.author?.name ?? 'anonim',
      message: (c.commit.message ?? '').split('\n')[0],
      url: c.html_url,
    })),
  };
}
