/**
 * Dosya değişim geçmişi.
 * Kaynak: exc_analyzer/commands/file_history.py
 *
 * CLI, yol verilmediginde dosyayi kod aramasiyla bulur. Web'de o kisayol
 * kaldirildi: GitHub'in arama ucuna kimlikli istek bazi tarayicilarda
 * dusuyor (ayni sunucunun /repos/... yolu calisirken /search/... yolu
 * engelleniyor). Kisayol yerine tam yol isteniyor; komutun kendisi tamamen
 * calisir durumda.
 */
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
    throw new Error(`En fazla ${MAX_LIMIT} kayıt istenebilir.`);
  }

  // Yol oldugu gibi gecirilir. Kok dizindeki bir dosyanin yolunda egik cizgi
  // yoktur ("README.md") ve bu gecerlidir; commits ucu ikisini de kabul eder.
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
      author: c.commit.author?.name ?? 'anonim',
      message: (c.commit.message ?? '').split('\n')[0],
      url: c.html_url,
    })),
  };
}
