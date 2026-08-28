/**
 * Derin sır taraması — mevcut dosya ağacı + son commit'ler.
 * Kaynak: exc_analyzer/commands/advanced_secrets.py
 *
 * HASSAS KOMUT. Sonucu hiçbir yere kaydedilmez, paylaşılabilir adresi yoktur,
 * topluluk akışına düşmez. Bulunan değerler yalnızca maskelenmiş gösterilir.
 */
import { GitHubClient } from '../lib/github';
import { findSecrets, isSuspectPath, mapWithLimit, type SecretMatch } from './secretPatterns';

export interface DeepFinding {
  type: string;
  masked: string;
  confidence: SecretMatch['confidence'];
  path: string;
  line: number;
  source: 'tree' | 'commit';
  sourceLabel: string;
  url: string;
}

export interface AdvancedSecretsResult {
  owner: string;
  repo: string;
  filesScanned: number;
  commitsScanned: number;
  truncatedTree: boolean;
  findings: DeepFinding[];
}

interface TreeResponse {
  tree: { path: string; type: string; size?: number }[];
  truncated: boolean;
}

interface CommitListItem {
  sha: string;
  html_url: string;
}

interface CommitDetail {
  files?: { filename: string; status: string }[];
}

const MAX_TREE_FILES = 60;
const MAX_FILE_BYTES = 400_000;

export async function advancedSecrets(
  gh: GitHubClient,
  owner: string,
  repo: string,
  commitLimit = 20,
): Promise<AdvancedSecretsResult> {
  const findings: DeepFinding[] = [];
  let filesScanned = 0;

  const treeRes = await gh.raw<TreeResponse>(`/repos/${owner}/${repo}/git/trees/HEAD`, {
    recursive: 1,
  });
  const tree = treeRes.data?.tree ?? [];
  const truncatedTree = treeRes.data?.truncated ?? false;

  const suspects = tree
    .filter((item) => item.type === 'blob' && isSuspectPath(item.path))
    .filter((item) => (item.size ?? 0) <= MAX_FILE_BYTES)
    .slice(0, MAX_TREE_FILES);

  await mapWithLimit(suspects, 6, async (item) => {
    const content = await gh.getFileContent(owner, repo, item.path);
    filesScanned += 1;
    if (!content) return;

    for (const match of findSecrets(content, item.path)) {
      findings.push({
        type: match.type,
        masked: match.masked,
        confidence: match.confidence,
        path: item.path,
        line: match.line,
        source: 'tree',
        sourceLabel: 'mevcut dosya',
        url: `https://github.com/${owner}/${repo}/blob/HEAD/${item.path}#L${match.line}`,
      });
    }
  });

  const commits = await gh.get<CommitListItem[]>(`/repos/${owner}/${repo}/commits`, {
    per_page: Math.min(commitLimit, 50),
  });

  await mapWithLimit(commits, 4, async (commit) => {
    const detail = await gh.raw<CommitDetail>(`/repos/${owner}/${repo}/commits/${commit.sha}`);
    const files = (detail.data?.files ?? []).filter(
      (f) => f.status === 'added' || f.status === 'modified',
    );

    await mapWithLimit(files.slice(0, 20), 6, async (file) => {
      const content = await gh.getFileContent(owner, repo, file.filename, commit.sha);
      filesScanned += 1;
      if (!content) return;

      for (const match of findSecrets(content, file.filename)) {
        findings.push({
          type: match.type,
          masked: match.masked,
          confidence: match.confidence,
          path: file.filename,
          line: match.line,
          source: 'commit',
          sourceLabel: `commit ${commit.sha.slice(0, 7)}`,
          url: commit.html_url,
        });
      }
    });
  });

  // Ayni dosya+tur+satir birden fazla kaynaktan gelebilir.
  const unique = new Map<string, DeepFinding>();
  for (const f of findings) {
    unique.set(`${f.path}:${f.line}:${f.type}`, f);
  }

  return {
    owner,
    repo,
    filesScanned,
    commitsScanned: commits.length,
    truncatedTree,
    findings: [...unique.values()],
  };
}
