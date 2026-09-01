import { GitHubClient } from '../lib/github';
export type WorkflowSeverity = 'critical' | 'risky' | 'warning' | 'info' | 'ok' | 'error';
export interface WorkflowFinding {
  severity: WorkflowSeverity;
  title: string;
  detail: string;
}
export interface WorkflowAudit {
  name: string;
  path: string;
  url: string;
  severity: WorkflowSeverity;
  findings: WorkflowFinding[];
}
export interface ActionsAuditResult {
  owner: string;
  repo: string;
  workflows: WorkflowAudit[];
  hasWorkflows: boolean;
}

const SEVERITY_ORDER: WorkflowSeverity[] = ['error', 'ok', 'info', 'warning', 'risky', 'critical'];
function worst(a: WorkflowSeverity, b: WorkflowSeverity): WorkflowSeverity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}
function inspect(content: string): WorkflowFinding[] {
  const findings: WorkflowFinding[] = [];
  if (/\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(bash|sh|zsh)\b/i.test(content)) {
    findings.push({
      severity: 'critical',
      title: 'A downloaded script is piped straight into a shell',
      detail:
        'curl/wget output goes straight into a shell. If that source is ever compromised, arbitrary code runs with every permission this workflow holds. Verify what you download and pin the version.',
    });
  }
  if (/^\s*pull_request_target\s*:/m.test(content)) {
    findings.push({
      severity: 'critical',
      title: 'pull_request_target trigger',
      detail:
        'This trigger runs fork pull requests in a context that can read the repository secrets. If it also checks out the pull request code, untrusted code reaches them.',
    });
  }
  if (/run:\s*[|>]?[\s\S]{0,400}?\$\{\{\s*github\.event\.[^}]*\}\}/.test(content)) {
    findings.push({
      severity: 'risky',
      title: 'User input is interpolated into a shell command',
      detail:
        'github.event fields such as the pull request title or branch name are written directly into run:. An attacker controls those fields, so pass them through an env variable instead.',
    });
  }
  const mutableUses = [...content.matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@(v?\d+(?:\.\d+)*|main|master|latest)\s*$/gim)]
    .map((m) => `${m[1]}@${m[2]}`)
    .filter((u) => !u.startsWith('actions/'));
  if (mutableUses.length > 0) {
    findings.push({
      severity: 'warning',
      title: 'Action version is not pinned to a commit SHA',
      detail: `A tag can be moved, and a compromised action would run with this workflow's permissions. Unpinned: ${[...new Set(mutableUses)].slice(0, 5).join(', ')}`,
    });
  }
  if (!/^\s*permissions\s*:/m.test(content)) {
    findings.push({
      severity: 'warning',
      title: 'No permissions block',
      detail:
        'GITHUB_TOKEN runs with default permissions. State the narrowest one explicitly: permissions: contents: read',
    });
  }
  if (/\bsecrets\.[A-Z_]/.test(content)) {
    findings.push({
      severity: 'info',
      title: 'Workflow uses secrets',
      detail: 'Check that secrets are only exposed to the steps that actually need them.',
    });
  }
  if (findings.length === 0) {
    findings.push({
      severity: 'ok',
      title: 'No obvious risk found',
      detail: 'None of the patterns we look for matched. That is not proof the workflow is safe.',
    });
  }
  return findings;
}
interface ContentEntry {
  name: string;
  path: string;
  type: string;
  download_url: string | null;
  html_url: string;
}
export async function actionsAudit(
  gh: GitHubClient,
  owner: string,
  repo: string,
): Promise<ActionsAuditResult> {
  const res = await gh.raw<ContentEntry[]>(`/repos/${owner}/${repo}/contents/.github/workflows`);
  if (res.status !== 200 || !Array.isArray(res.data)) {
    return { owner, repo, workflows: [], hasWorkflows: false };
  }
  const files = res.data.filter(
    (f) => f.type === 'file' && /\.ya?ml$/i.test(f.name),
  );
  const workflows: WorkflowAudit[] = [];
  for (const file of files) {
    const content = await gh.getFileContent(owner, repo, file.path);
    if (content === null) {
      workflows.push({
        name: file.name,
        path: file.path,
        url: file.html_url,
        severity: 'error',
        findings: [
          { severity: 'error', title: 'Could not read the file', detail: 'The file could not be downloaded.' },
        ],
      });
      continue;
    }
    const findings = inspect(content);
    workflows.push({
      name: file.name,
      path: file.path,
      url: file.html_url,
      severity: findings.reduce<WorkflowSeverity>((acc, f) => worst(acc, f.severity), 'ok'),
      findings,
    });
  }
  return { owner, repo, workflows, hasWorkflows: workflows.length > 0 };
}