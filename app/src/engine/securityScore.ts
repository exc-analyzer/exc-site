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
  verdict: 'excellent' | 'good' | 'weak';
  criteria: Criterion[];
  evaluatedCount: number;
  unknownCount: number;
  scannedAt: string;
}

interface RepoInfo {
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
export async function securityScore(
  gh: GitHubClient,
  owner: string,
  repo: string,
): Promise<SecurityScoreResult> {
  const info = await gh.get<RepoInfo>(`/repos/${owner}/${repo}`);
  const isAdmin = info.permissions?.admin === true;
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
    weight: 5,
    status: info.has_wiki ? 'pass' : 'fail',
    detail: info.has_wiki ? 'Open' : 'Disabled',
    fix: info.has_wiki
      ? undefined
      : 'Enable the wiki, or keep the documentation in the README instead.',
  });
  criteria.push({
    id: 'projects',
    label: 'Projects',
    weight: 5,
    status: info.has_projects ? 'pass' : 'fail',
    detail: info.has_projects ? 'Open' : 'Disabled',
    fix: info.has_projects
      ? undefined
      : 'With Projects enabled, outsiders can follow where the work is heading.',
  });
  const open = info.open_issues_count ?? 0;
  criteria.push({
    id: 'open_issues',
    label: 'Open issues',
    weight: open > 50 ? 10 : 5,
    status: open > 10 ? 'fail' : 'pass',
    detail: String(open),
    fix:
      open > 10
        ? 'Triage the backlog — a security report may be sitting unread among them.'
        : undefined,
  });

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
  return {
    owner,
    repo,
    score,
    verdict: score >= 90 ? 'excellent' : score >= 75 ? 'good' : 'weak',
    criteria,
    evaluatedCount: criteria.filter((c) => c.status !== 'unknown').length,
    unknownCount: criteria.filter((c) => c.status === 'unknown').length,
    scannedAt: new Date().toISOString(),
  };
}