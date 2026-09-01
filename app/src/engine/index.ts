import type { GitHubClient } from '../lib/github';
import { analysis, type AnalysisResult } from './analysis';
import { securityScore, type SecurityScoreResult } from './securityScore';
import { contentAudit, type ContentAuditResult } from './contentAudit';
import { contribImpact, type ContribImpactResult } from './contribImpact';
import { commitAnomaly, type CommitAnomalyResult } from './commitAnomaly';
import { fileHistory, type FileHistoryResult } from './fileHistory';
import { actionsAudit, type ActionsAuditResult } from './actionsAudit';
import { userAnalysis, type UserAnalysisResult } from './userAnalysis';
import { userAnomaly, type UserAnomalyResult } from './userAnomaly';
import { scanSecrets, type ScanSecretsResult } from './scanSecrets';
import { advancedSecrets, type AdvancedSecretsResult } from './advancedSecrets';
import { dorkScan, DORK_PRESETS, type DorkScanResult } from './dorkScan';

export type CommandId =
  | 'analysis'
  | 'security-score'
  | 'content-audit'
  | 'contrib-impact'
  | 'file-history'
  | 'actions-audit'
  | 'commit-anomaly'
  | 'user-analysis'
  | 'user-anomaly'
  | 'scan-secrets'
  | 'advanced-secrets'
  | 'dork-scan';

export type CommandResult =
  | { id: 'analysis'; data: AnalysisResult }
  | { id: 'security-score'; data: SecurityScoreResult }
  | { id: 'content-audit'; data: ContentAuditResult }
  | { id: 'contrib-impact'; data: ContribImpactResult }
  | { id: 'file-history'; data: FileHistoryResult }
  | { id: 'actions-audit'; data: ActionsAuditResult }
  | { id: 'commit-anomaly'; data: CommitAnomalyResult }
  | { id: 'user-analysis'; data: UserAnalysisResult }
  | { id: 'user-anomaly'; data: UserAnomalyResult }
  | { id: 'scan-secrets'; data: ScanSecretsResult }
  | { id: 'advanced-secrets'; data: AdvancedSecretsResult }
  | { id: 'dork-scan'; data: DorkScanResult };

export type CommandCategory = 'intel' | 'security' | 'anomaly' | 'sensitive';

export const CATEGORIES: { id: CommandCategory; label: string; note?: string }[] = [
  { id: 'intel', label: 'Intelligence' },
  { id: 'security', label: 'Security' },
  { id: 'anomaly', label: 'Anomaly' },
  {
    id: 'sensitive',
    label: 'Sensitive',
    note: 'These results are never saved, never shared, and every value stays masked.',
  },
];

export type FieldKind = 'repo' | 'user' | 'text' | 'number' | 'select' | 'checkbox';

export interface FieldSpec {
  key: string;
  kind: FieldKind;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  min?: number;
  max?: number;
  defaultValue?: string | number | boolean;
  options?: { value: string; label: string }[];
}

export interface CommandDef {
  id: CommandId;
  name: string;
  cli: string;
  summary: string;
  category: CommandCategory;
  fields: FieldSpec[];
  sensitive: boolean;
  requiresAuth?: boolean;
  authReason?: string;
}

const REPO_FIELD: FieldSpec = {
  key: 'repo',
  kind: 'repo',
  label: 'Repository',
  placeholder: 'owner/repo — e.g. torvalds/linux',
  required: true,
};

const USER_FIELD: FieldSpec = {
  key: 'username',
  kind: 'user',
  label: 'User',
  placeholder: 'GitHub username — e.g. torvalds',
  required: true,
};

export const COMMANDS: CommandDef[] = [
  {
    id: 'security-score',
    name: 'Security score',
    cli: 'exc security-score <owner/repo>',
    summary: 'Rates how well a repository is defended, and names what to fix first.',
    category: 'security',
    fields: [REPO_FIELD],
    sensitive: false,
  },
  {
    id: 'content-audit',
    name: 'Content audit',
    cli: 'exc content-audit <owner/repo>',
    summary: 'Community standards: LICENSE, SECURITY.md, CONTRIBUTING and the rest.',
    category: 'intel',
    fields: [REPO_FIELD],
    sensitive: false,
  },
  {
    id: 'analysis',
    name: 'Repository analysis',
    cli: 'exc analysis <owner/repo>',
    summary: 'The whole picture: languages, commit rhythm, who is behind it.',
    category: 'intel',
    fields: [REPO_FIELD],
    sensitive: false,
    requiresAuth: true,
    authReason: 'GitHub only answers GraphQL queries for signed-in users.',
  },
  {
    id: 'contrib-impact',
    name: 'Contribution impact',
    cli: 'exc contrib-impact <owner/repo>',
    summary: 'Measures who actually carries the project, from lines changed.',
    category: 'intel',
    fields: [REPO_FIELD],
    sensitive: false,
  },
  {
    id: 'file-history',
    name: 'File history',
    cli: 'exc file-history <owner/repo> <file>',
    summary: 'How a single file changed, and who changed it.',
    category: 'intel',
    fields: [
      REPO_FIELD,
      {
        key: 'path',
        kind: 'text',
        label: 'File',
        placeholder: 'README.md or src/app/main.py',
        hint: 'Full path inside the repository.',
        required: true,
      },
      { key: 'limit', kind: 'number', label: 'Entries', defaultValue: 20, min: 1, max: 50 },
    ],
    sensitive: false,
  },
  {
    id: 'user-analysis',
    name: 'User analysis',
    cli: 'exc user-a <username>',
    summary: 'Profile summary, notable repositories and language mix.',
    category: 'intel',
    fields: [USER_FIELD],
    sensitive: false,
  },
  {
    id: 'actions-audit',
    name: 'Actions audit',
    cli: 'exc actions-audit <owner/repo>',
    summary: 'Supply-chain and injection risks in CI/CD workflows.',
    category: 'security',
    fields: [REPO_FIELD],
    sensitive: false,
  },
  {
    id: 'commit-anomaly',
    name: 'Commit anomaly',
    cli: 'exc commit-anomaly <owner/repo>',
    summary: 'Flags commit messages that do not look like ordinary work.',
    category: 'anomaly',
    fields: [
      REPO_FIELD,
      { key: 'limit', kind: 'number', label: 'Commits', defaultValue: 30, min: 5, max: 100 },
    ],
    sensitive: false,
  },
  {
    id: 'user-anomaly',
    name: 'User anomaly',
    cli: 'exc user-anomaly <username>',
    summary: 'Scores unusual account behaviour. A signal to check, not an accusation.',
    category: 'anomaly',
    fields: [USER_FIELD],
    sensitive: false,
  },
  {
    id: 'scan-secrets',
    name: 'Secret scan',
    cli: 'exc scan-secrets <owner/repo>',
    summary: 'Looks for keys leaked in files added by recent commits.',
    category: 'sensitive',
    fields: [
      REPO_FIELD,
      { key: 'limit', kind: 'number', label: 'Commits', defaultValue: 10, min: 1, max: 50 },
    ],
    sensitive: true,
  },
  {
    id: 'advanced-secrets',
    name: 'Deep secret scan',
    cli: 'exc advanced-secrets <owner/repo>',
    summary: 'Sweeps the current file tree and the commit history together.',
    category: 'sensitive',
    fields: [
      REPO_FIELD,
      { key: 'limit', kind: 'number', label: 'Commits', defaultValue: 20, min: 1, max: 50 },
    ],
    sensitive: true,
  },
];

export function getCommand(id: CommandId): CommandDef {
  const found = COMMANDS.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown command: ${id}`);
  return found;
}

export type FieldValues = Record<string, string | number | boolean>;

function repoOf(values: FieldValues): { owner: string; repo: string } {
  const raw = String(values.repo ?? '');
  const parts = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean);
  if (parts.length !== 2) throw new Error('Repository must be written as "owner/repo".');
  return { owner: parts[0], repo: parts[1] };
}

function num(values: FieldValues, key: string, fallback: number): number {
  const raw = Number(values[key]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

export async function runCommand(
  gh: GitHubClient,
  id: CommandId,
  values: FieldValues,
): Promise<CommandResult> {
  switch (id) {
    case 'analysis': {
      const { owner, repo } = repoOf(values);
      return { id, data: await analysis(gh, owner, repo) };
    }
    case 'security-score': {
      const { owner, repo } = repoOf(values);
      return { id, data: await securityScore(gh, owner, repo) };
    }
    case 'content-audit': {
      const { owner, repo } = repoOf(values);
      return { id, data: await contentAudit(gh, owner, repo) };
    }
    case 'contrib-impact': {
      const { owner, repo } = repoOf(values);
      return { id, data: await contribImpact(gh, owner, repo) };
    }
    case 'file-history': {
      const { owner, repo } = repoOf(values);
      const path = String(values.path ?? '').trim();
      if (!path) throw new Error('A file name or path is required.');
      return { id, data: await fileHistory(gh, owner, repo, path, num(values, 'limit', 20)) };
    }
    case 'actions-audit': {
      const { owner, repo } = repoOf(values);
      return { id, data: await actionsAudit(gh, owner, repo) };
    }
    case 'commit-anomaly': {
      const { owner, repo } = repoOf(values);
      return { id, data: await commitAnomaly(gh, owner, repo, num(values, 'limit', 30)) };
    }
    case 'user-analysis': {
      const username = String(values.username ?? '').trim();
      if (!username) throw new Error('A username is required.');
      return { id, data: await userAnalysis(gh, username) };
    }
    case 'user-anomaly': {
      const username = String(values.username ?? '').trim();
      if (!username) throw new Error('A username is required.');
      return { id, data: await userAnomaly(gh, username) };
    }
    case 'scan-secrets': {
      const { owner, repo } = repoOf(values);
      return { id, data: await scanSecrets(gh, owner, repo, num(values, 'limit', 10)) };
    }
    case 'advanced-secrets': {
      const { owner, repo } = repoOf(values);
      return { id, data: await advancedSecrets(gh, owner, repo, num(values, 'limit', 20)) };
    }
    case 'dork-scan': {
      const query = String(values.query ?? '').trim();
      const preset = String(values.preset ?? '').trim();
      return {
        id,
        data: await dorkScan(gh, {
          queries: query ? [query] : [],
          preset: preset ? (preset as keyof typeof DORK_PRESETS) : undefined,
          limit: num(values, 'limit', 10),
          verify: Boolean(values.verify),
        }),
      };
    }
  }
}
