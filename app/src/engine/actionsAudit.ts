/**
 * GitHub Actions iş akışı denetimi.
 * Kaynak: exc_analyzer/commands/actions_audit.py
 *
 * CLI'ye göre bilinçli bir DÜZELTME içeriyor.
 *
 * CLI riski şu düzenli ifadeyle arıyor:
 *     (curl|wget|bash|sh|powershell|python|node)
 * `sh` kelime sınırı olmadan arandığı için "push", "shell", "bash" gibi hemen
 * her kelimenin içinde eşleşiyor. Sonuç: neredeyse her iş akışı "riskli"
 * işaretleniyor ve uyarı hiçbir şey ifade etmiyor.
 *
 * Burada kelime sınırı kullanılıyor ve asıl önemli olan, gerçekten tehlikeli
 * olan kalıplar ayrıca aranıyor: kabuğa boru, pull_request_target, sabitlenmemiş
 * action sürümü ve script enjeksiyonu.
 */
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

  // İnternetten indirip doğrudan kabuğa vermek: tedarik zinciri açığı.
  if (/\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(bash|sh|zsh)\b/i.test(content)) {
    findings.push({
      severity: 'critical',
      title: 'İnternetten indirilen betik doğrudan çalıştırılıyor',
      detail:
        'curl/wget çıktısı doğrudan kabuğa veriliyor. Kaynak ele geçirilirse iş akışının bütün yetkileriyle kod çalışır. İndirileni önce doğrula, sürümü sabitle.',
    });
  }

  // pull_request_target, fork'tan gelen kodu depo sırlarıyla aynı bağlamda çalıştırır.
  if (/^\s*pull_request_target\s*:/m.test(content)) {
    findings.push({
      severity: 'critical',
      title: 'pull_request_target tetikleyicisi',
      detail:
        'Bu tetikleyici fork PR’larını deponun sırlarına erişebilen bir bağlamda çalıştırır. PR kodunu checkout ediyorsa yabancı kod sırlarına ulaşabilir.',
    });
  }

  // ${{ ... }} doğrudan run: içine gömülürse kabuk enjeksiyonu olur.
  if (/run:\s*[|>]?[\s\S]{0,400}?\$\{\{\s*github\.event\.[^}]*\}\}/.test(content)) {
    findings.push({
      severity: 'risky',
      title: 'Kullanıcı girdisi kabuk komutuna gömülü',
      detail:
        'github.event alanları (PR başlığı, dal adı gibi) doğrudan run: içine yazılmış. Bu alanları saldırgan belirleyebilir; env değişkeni üzerinden geçir.',
    });
  }

  // Oynak etiketle sabitlenmiş third-party action.
  const mutableUses = [...content.matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@(v?\d+(?:\.\d+)*|main|master|latest)\s*$/gim)]
    .map((m) => `${m[1]}@${m[2]}`)
    .filter((u) => !u.startsWith('actions/'));
  if (mutableUses.length > 0) {
    findings.push({
      severity: 'warning',
      title: 'Action sürümü commit SHA’ya sabitlenmemiş',
      detail: `Etiket taşınabilir; ele geçirilen bir action bu iş akışının yetkileriyle çalışır. Sabitlenmemiş: ${[...new Set(mutableUses)].slice(0, 5).join(', ')}`,
    });
  }

  // permissions bloğu yoksa varsayılan (geniş) token izinleri geçerli olur.
  if (!/^\s*permissions\s*:/m.test(content)) {
    findings.push({
      severity: 'warning',
      title: 'permissions bloğu yok',
      detail:
        'GITHUB_TOKEN varsayılan izinlerle çalışır. En dar izni açıkça yaz: permissions: contents: read',
    });
  }

  if (/\bsecrets\.[A-Z_]/.test(content)) {
    findings.push({
      severity: 'info',
      title: 'İş akışı sır kullanıyor',
      detail: 'Sırların yalnızca gerektiği adımlarda ve en dar kapsamda kullanıldığını gözden geçir.',
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: 'ok',
      title: 'Belirgin risk görülmedi',
      detail: 'Aranan kalıplarda bir bulgu yok. Bu, iş akışının güvenli olduğunun kanıtı değildir.',
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
    if (!file.download_url) continue;
    const content = await gh.fetchText(file.download_url);
    if (content === null) {
      workflows.push({
        name: file.name,
        path: file.path,
        url: file.html_url,
        severity: 'error',
        findings: [
          { severity: 'error', title: 'İçerik okunamadı', detail: 'Dosya indirilemedi.' },
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
