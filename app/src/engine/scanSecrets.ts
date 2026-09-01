import { GitHubClient } from '../lib/github';
import { findSecrets, mapWithLimit, type SecretMatch } from './secretPatterns';
export interface SecretFinding {
  type: string;
  masked: string;
  confidence: SecretMatch['confidence'];
  file: string;
  line: number;
  commitSha: string;
  commitUrl: string;
  date: string;
  author: string;
}
export interface ScanSecretsResult {
  owner: string;
  repo: string;
  commitsScanned: number;
  filesScanned: number;
  findings: SecretFinding[];
}
interface CommitListItem {
  sha: string;
  url: string;
  html_url: string;
  commit: { author: { name: string; date: string } | null };
}
interface CommitDetail {
  files?: { filename: string; status: string }[];
}
const MAX_LIMIT = 50;

export async function scanSecrets(
  gh: GitHubClient,
  owner: string,
  repo: string,
  limit = 10,
): Promise<ScanSecretsResult> {
  if (limit > MAX_LIMIT) throw new Error(`En fazla ${MAX_LIMIT} commit taranabilir.`);
  const commits = await gh.get<CommitListItem[]>(`/repos/${owner}/${repo}/commits`, {
    per_page: limit,
  });
  const findings: SecretFinding[] = [];
  let filesScanned = 0;
  await mapWithLimit(commits.slice(0, limit), 4, async (commit) => {
    const detail = await gh.raw<CommitDetail>(`/repos/${owner}/${repo}/commits/${commit.sha}`);
    const files = (detail.data?.files ?? []).filter((f) => f.status === 'added');
    await mapWithLimit(files, 6, async (file) => {

      const content = await gh.getFileContent(owner, repo, file.filename, commit.sha);
      filesScanned += 1;
      if (!content) return;

      for (const match of findSecrets(content, file.filename)) {
        findings.push({
          type: match.type,
          masked: match.masked,
          confidence: match.confidence,
          file: file.filename,
          line: match.line,
          commitSha: commit.sha.slice(0, 7),
          commitUrl: commit.html_url,
          date: commit.commit.author?.date ?? '',
          author: commit.commit.author?.name ?? 'unknown',
        });
      }
    });
  });
  return {
    owner,
    repo,
    commitsScanned: commits.length,
    filesScanned,
    findings,
  };
}