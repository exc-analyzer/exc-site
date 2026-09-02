import { GitHubClient } from '../lib/github';

export type SignalLevel = 'strong' | 'weak';

export interface CommitSignal {
  label: string;
  level: SignalLevel;
}

export interface RiskyCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
  signals: CommitSignal[];
}

export interface CommitAnomalyResult {
  owner: string;
  repo: string;
  scannedCount: number;
  risky: RiskyCommit[];
}

interface Rule {
  pattern: RegExp;
  label: string;
  level: SignalLevel;
}

const RULES: Rule[] = [
  {
    pattern: /\b(remove|removing|disable|disabling|skip|skipping|bypass|bypassing|turn off)\s+(the\s+)?(security|auth\w*|check|checks|validation|verification|ssl|tls|cert\w*|signature|permission\w*)\b/,
    label: 'turns off a safety check',
    level: 'strong',
  },
  { pattern: /\bback[- ]?door\b/, label: 'mentions a backdoor', level: 'strong' },
  { pattern: /\bhard[- ]?cod(e|ed|ing)\b/, label: 'hardcodes a value', level: 'strong' },
  {
    pattern:
      /\b(add|adding|commit|committing|leave|leaving)\s+(the\s+)?(api[- ]?key|secret|secrets|token|password|credential|credentials)\b(?!\s+(scan\w*|detect\w*|manage\w*|rotat\w*|handl\w*|storage|support|check\w*|test\w*|redaction|masking|policy|docs?))/,
    label: 'adds a credential',
    level: 'strong',
  },
  {
    pattern: /\b(temp|temporary|quick|dirty|ugly)\s+(fix|hack|patch|workaround|solution)\b/,
    label: 'admits a temporary fix',
    level: 'weak',
  },
  { pattern: /\bhack(y|ish)?\b/, label: 'calls itself a hack', level: 'weak' },
  { pattern: /\b(fixme|todo|xxx)\b/, label: 'leaves a marker behind', level: 'weak' },
  { pattern: /\b(oops|whoops|my bad)\b/, label: 'reads as an accident', level: 'weak' },
  { pattern: /\[?\bskip[ -](ci|tests?)\b\]?/, label: 'skips CI or tests', level: 'weak' },
  {
    pattern: /\b(leftover|remove|removing|stray)\s+(debug|console|print)\w*\b/,
    label: 'leftover debug code',
    level: 'weak',
  },
  { pattern: /\brevert\s+"?revert\b/, label: 'reverts a revert', level: 'weak' },
];

const MEANINGLESS = /^(\.+|-+|update[sd]?|fix(es|ed)?|change[sd]?|stuff|things?|wip|misc|minor|asdf+|a+|x+|test|tmp|temp|commit|new|edit)$/i;

function subjectOf(message: string): string {
  return message.split('\n')[0].trim();
}

function signalsFor(subject: string): CommitSignal[] {
  const lower = subject.toLowerCase();
  const found: CommitSignal[] = [];

  for (const rule of RULES) {
    if (rule.pattern.test(lower)) found.push({ label: rule.label, level: rule.level });
  }

  const bare = lower.replace(/^\w+(\([^)]*\))?!?:\s*/, '').trim();
  if (bare.length > 0 && (MEANINGLESS.test(bare) || bare.length < 3)) {
    found.push({ label: 'says nothing about the change', level: 'weak' });
  }

  return found;
}

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
    const subject = subjectOf(c.commit.message ?? '');
    const signals = signalsFor(subject);
    if (signals.length === 0) continue;
    risky.push({
      sha: c.sha.slice(0, 7),
      message: subject,
      author: c.commit.author?.name ?? 'unknown',
      date: c.commit.author?.date ?? '',
      url: c.html_url,
      signals,
    });
  }

  risky.sort(
    (a, b) =>
      Number(b.signals.some((s) => s.level === 'strong')) -
      Number(a.signals.some((s) => s.level === 'strong')),
  );

  return { owner, repo, scannedCount: commits.length, risky };
}
