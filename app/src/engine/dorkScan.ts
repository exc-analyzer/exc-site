import { GitHubClient } from '../lib/github';
import { findSecrets, mapWithLimit } from './secretPatterns';
export const DORK_PRESETS: Record<string, { label: string; queries: string[] }> = {
  secrets: {
    label: 'Secret files',
    queries: [
      'filename:.env',
      'filename:id_rsa',
      'filename:id_ed25519',
      'filename:secrets.json',
      'filename:deployment-config.json',
    ],
  },
  config: {
    label: 'Configuration files',
    queries: [
      'filename:wp-config.php',
      'filename:config.php',
      'filename:database.yml',
      'filename:settings.json',
      'filename:Web.config',
    ],
  },
  actions: {
    label: 'CI/CD workflows',
    queries: [
      'filename:main.yml path:.github/workflows',
      'filename:deploy.yml path:.github/workflows',
      'filename:release.yml path:.github/workflows',
    ],
  },
  aws: {
    label: 'AWS credentials',
    queries: ['filename:.aws/credentials', 'aws_access_key_id', 'aws_secret_access_key'],
  },
  azure: {
    label: 'Azure credentials',
    queries: ['azure_storage_account', 'azure_storage_access_key', 'filename:azureProfile.json'],
  },
  google: {
    label: 'Google credentials',
    queries: [
      'filename:client_secret.json',
      'filename:service_account.json',
      'GOOGLE_APPLICATION_CREDENTIALS',
    ],
  },
};
export type DorkVerdict = 'confirmed' | 'suspicious' | 'clean' | 'unverified' | 'unreadable';
export interface DorkHit {
  repo: string;
  path: string;
  url: string;
  verdict: DorkVerdict;
  verdictLabel: string;

  matches: { type: string; masked: string; line: number }[];
}
export interface DorkScanResult {
  query: string;
  totalFound: number;
  hits: DorkHit[];
  verified: boolean;
  filteredOut: number;
}

const VERDICT_LABELS: Record<DorkVerdict, string> = {
  confirmed: 'Secret found',
  suspicious: 'Suspicious',
  clean: 'Looks clean',
  unverified: 'Not verified',
  unreadable: 'Content unreadable',
};
const MODIFIERS = [
  'repo', 'user', 'org', 'path', 'filename', 'extension', 'size', 'pushed',
  'created', 'language', 'topic', 'license', 'followers', 'fork', 'stars', 'is',
];
function smartQuote(query: string): string {
  const q = query.trim();
  if (q.startsWith('"') && q.endsWith('"')) return q;
  if (!q.includes(' ')) return q;
  if (MODIFIERS.some((m) => q.includes(`${m}:`))) return q;
  return `"${q}"`;
}

interface SearchResponse {
  total_count: number;
  items: {
    path: string;
    html_url: string;
    repository: { full_name: string };
  }[];
}

export interface DorkScanOptions {
  queries?: string[];
  preset?: keyof typeof DORK_PRESETS;
  limit?: number;
  verify?: boolean;
}
export async function dorkScan(
  gh: GitHubClient,
  options: DorkScanOptions,
): Promise<DorkScanResult> {
  const parts: string[] = [];
  if (options.queries?.length) parts.push(...options.queries.filter((q) => q.trim()));
  if (options.preset) parts.push(...DORK_PRESETS[options.preset].queries);
  if (parts.length === 0) throw new Error('At least one search term is required.');
  const processed = parts.map(smartQuote);
  const q = options.preset ? processed.join(' OR ') : processed.join(' ');
  const limit = Math.min(options.limit ?? 10, 100);
  const res = await gh.get<SearchResponse>('/search/code', { q, per_page: limit });
  const items = res.items ?? [];

  if (!options.verify) {
    return {
      query: q,
      totalFound: res.total_count ?? items.length,
      verified: false,
      filteredOut: 0,
      hits: items.map((item) => ({
        repo: item.repository.full_name,
        path: item.path,
        url: item.html_url,
        verdict: 'unverified' as DorkVerdict,
        verdictLabel: VERDICT_LABELS.unverified,
        matches: [],
      })),
    };
  }
  const checked = await mapWithLimit(items, 4, async (item): Promise<DorkHit> => {
    const [owner, repoName] = item.repository.full_name.split('/');
    const refMatch = item.html_url.match(/\/blob\/([^/]+)\//);
    const content = await gh.getFileContent(
      owner,
      repoName,
      item.path,
      refMatch ? refMatch[1] : undefined,
    );
    if (content === null) {
      return {
        repo: item.repository.full_name,
        path: item.path,
        url: item.html_url,
        verdict: 'unreadable',
        verdictLabel: VERDICT_LABELS.unreadable,
        matches: [],
      };
    }
    const matches = findSecrets(content, item.path);
    const highConfidence = matches.some((m) => m.confidence !== 'low');
    const verdict: DorkVerdict =
      matches.length === 0 ? 'clean' : highConfidence ? 'confirmed' : 'suspicious';
    return {
      repo: item.repository.full_name,
      path: item.path,
      url: item.html_url,
      verdict,
      verdictLabel: VERDICT_LABELS[verdict],
      matches: matches.slice(0, 5).map((m) => ({ type: m.type, masked: m.masked, line: m.line })),
    };
  });
  const risky = checked.filter((h) => h.verdict === 'confirmed' || h.verdict === 'suspicious');
  const order: DorkVerdict[] = ['confirmed', 'suspicious', 'unreadable', 'clean', 'unverified'];
  risky.sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict));
  return {
    query: q,
    totalFound: res.total_count ?? items.length,
    verified: true,
    filteredOut: checked.length - risky.length,
    hits: risky,
  };
}
