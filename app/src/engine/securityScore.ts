import { GitHubClient } from '../lib/github';
export type CriterionStatus = 'pass' | 'fail' | 'unknown';
export interface Criterion {
  id: string;
  label: string;
  weight: number;
  status: CriterionStatus;
  detail: string;
  fix?: string;
}
export interface SecurityScoreResult {
  owner: string;
  repo: string;
  score: number;
  checksPassed: number;
  criteria: Criterion[];
  evaluatedCount: number;
  unknownCount: number;
  scannedAt: string;
}

interface RepoInfo {
  full_name?: string;
  license: { spdx_id?: string | null; name?: string | null } | null;
  has_issues: boolean;
  has_wiki: boolean;
  has_projects: boolean;
  open_issues_count: number;
  default_branch: string;
  permissions?: { admin?: boolean } | null;
}

async function fileExists(
  gh: GitHubClient,
  owner: string,
  repo: string,
  paths: string[],
): Promise<boolean | null> {
  let sawUnexpected = false;
  for (const path of paths) {
    const res = await gh.raw(`/repos/${owner}/${repo}/contents/${path}`);
    if (res.status === 200) return true;
    if (res.status !== 404) sawUnexpected = true;
  }
  return sawUnexpected ? null : false;
}
function licenseLabel(license: RepoInfo['license']): string {
  if (!license) return 'None';
  const spdx = license.spdx_id;
  if (spdx && spdx !== 'NOASSERTION') return spdx;
  if (license.name && license.name !== 'Other') return license.name;
  return 'Present, but GitHub could not identify it';
}
export type ScoreStep = (label: string, done: number, total: number) => void;

const STEP_COUNT = 5;

export async function securityScore(
  gh: GitHubClient,
  owner: string,
  repo: string,
  onStep?: ScoreStep,
): Promise<SecurityScoreResult> {
  const step = (label: string, done: number) =>
    onStep?.(label, done, STEP_COUNT);

  step('Reading the repository', 0);
  const info = await gh.get<RepoInfo>(`/repos/${owner}/${repo}`);
  const isAdmin = info.permissions?.admin === true;
  const [realOwner, realRepo] = (info.full_name ?? `${owner}/${repo}`).split("/");
  const criteria: Criterion[] = [];
  criteria.push({
    id: 'license',
    label: 'License',
    weight: 10,
    status: info.license ? 'pass' : 'fail',
    detail: licenseLabel(info.license),
    fix: info.license
      ? undefined
      : 'Add a LICENSE file. Without one the code cannot legally be reused, so nobody can depend on it.',
  });
  criteria.push({
    id: 'issues',
    label: 'Issue tracker',
    weight: 10,
    status: info.has_issues ? 'pass' : 'fail',
    detail: info.has_issues ? 'Open' : 'Disabled',
    fix: info.has_issues
      ? undefined
      : 'Enable issues so there is somewhere to report problems, including security ones.',
  });
  criteria.push({
    id: 'wiki',
    label: 'Wiki',
    weight: 0,
    status: 'unknown',
    detail: info.has_wiki ? 'Open' : 'Disabled (not scored)',
  });
  criteria.push({
    id: 'projects',
    label: 'Projects',
    weight: 0,
    status: 'unknown',
    detail: info.has_projects ? 'Open' : 'Disabled (not scored)',
  });
  const open = info.open_issues_count ?? 0;
  criteria.push({
    id: 'open_issues',
    label: 'Open issues',
    weight: 0,
    status: 'unknown',
    detail: `${open} (not scored)`,
  });

  step('Looking for a security policy', 1);
  const hasSecurity = await fileExists(gh, owner, repo, [
    'SECURITY.md',
    '.github/SECURITY.md',
    'docs/SECURITY.md',
  ]);
  criteria.push({
    id: 'security_md',
    label: 'Security policy',
    weight: 10,
    status: hasSecurity === null ? 'unknown' : hasSecurity ? 'pass' : 'fail',
    detail: hasSecurity === null ? 'Could not read' : hasSecurity ? 'Present' : 'Missing',
    fix:
      hasSecurity === false
        ? 'Add SECURITY.md so someone who finds a vulnerability knows how to reach you privately.'
        : undefined,
  });
  step('Checking branch protection', 2);
  const prot = await gh.raw(
    `/repos/${owner}/${repo}/branches/${info.default_branch}/protection`,
  );
  let protStatus: CriterionStatus;
  let protDetail: string;
  if (prot.status === 200) {
    protStatus = 'pass';
    protDetail = 'Enabled';
  } else if (isAdmin && prot.status === 404) {
    protStatus = 'fail';
    protDetail = 'Disabled';
  } else {
    protStatus = 'unknown';
    protDetail = 'Unknown — only repository admins can see this';
  }
  criteria.push({
    id: 'branch_protection',
    label: `Branch protection (${info.default_branch})`,
    weight: 10,
    status: protStatus,
    detail: protDetail,
    fix:
      protStatus === 'fail'
        ? 'Protect the default branch: block force pushes and merges without review.'
        : undefined,
  });
  step('Looking for a dependency bot', 4);
  const hasDependabot = await fileExists(gh, owner, repo, [
    '.github/dependabot.yml',
    '.github/dependabot.yaml',
  ]);
  criteria.push({
    id: 'dependabot',
    label: 'Dependabot config',
    weight: 5,
    status: hasDependabot === null ? 'unknown' : hasDependabot ? 'pass' : 'fail',
    detail: hasDependabot === null ? 'Could not read' : hasDependabot ? 'Present' : 'Missing',
    fix:
      hasDependabot === false
        ? 'Add .github/dependabot.yml so dependency updates arrive as pull requests instead of piling up.'
        : undefined,
  });
  step('Asking about code scanning', 3);
  const scan = await gh.raw<unknown[]>(`/repos/${owner}/${repo}/code-scanning/alerts`);
  let scanStatus: CriterionStatus;
  let scanDetail: string;
  if (scan.status === 200 && Array.isArray(scan.data)) {
    const n = scan.data.length;
    scanStatus = n > 0 ? 'fail' : 'pass';
    scanDetail = n > 0 ? `${n} open alert${n === 1 ? '' : 's'}` : 'No open alerts';
  } else if (isAdmin && scan.status === 404) {
    scanStatus = 'unknown';
    scanDetail = 'Not set up (not scored)';
  } else {
    scanStatus = 'unknown';
    scanDetail = 'Unknown — alerts are not public';
  }
  criteria.push({
    id: 'code_scanning',
    label: 'Code scanning alerts',
    weight: 10,
    status: scanStatus,
    detail: scanDetail,
    fix: scanStatus === 'fail' ? 'Review and close the open alerts.' : undefined,
  });
  const lost = criteria
    .filter((c) => c.status === 'fail')
    .reduce((sum, c) => sum + c.weight, 0);
  const score = Math.max(0, 100 - lost);
  step('Adding it up', STEP_COUNT);
  return {
    owner: realOwner,
    repo: realRepo,
    score,
    checksPassed: criteria.filter((c) => c.status === 'pass').length,
    criteria,
    evaluatedCount: criteria.filter((c) => c.status !== 'unknown').length,
    unknownCount: criteria.filter((c) => c.status === 'unknown').length,
    scannedAt: new Date().toISOString(),
  };
}