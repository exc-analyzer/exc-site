/**
 * Depo güvenlik puanlaması.
 *
 * Kaynak: exc_analyzer/commands/security_score.py
 *
 * CLI'ye göre tek davranış farkı bilinçli bir DÜZELTMEdir:
 *
 *   CLI, branch protection ucundan 200 dışında bir yanıt alırsa 10 puan
 *   düşürüyor. Ama o uç yalnızca depoya admin erişimi olanlara açıktır;
 *   başkasının deposunda 403/404 döner. Yani CLI, sahibi olmadığın her depoyu
 *   haksız yere cezalandırıyor — torvalds/linux üzerinde ölçüldü: CLI 60/100
 *   verip "Dal Koruması: Devre Dışı" diyor, oysa koruma var, CLI okuyamıyor.
 *
 *   Burada "bilinmiyor" ile "kapalı" ayrılıyor: GitHub 404 + "Branch not
 *   protected" derse depo gerçekten korumasızdır ve puan düşer. Yetki
 *   yetersizliği nedeniyle okunamıyorsa kriter puanlamadan tamamen çıkarılır
 *   ve raporda "bilinmiyor" olarak gösterilir.
 *
 * Aynı düzeltme CLI'ye de uygulanmalıdır.
 */
import { GitHubClient } from '../lib/github';

export type CriterionStatus = 'pass' | 'fail' | 'unknown';

export interface Criterion {
  id: string;
  label: string;
  weight: number;
  status: CriterionStatus;
  detail: string;
  /** Nasıl düzeltilir. Rapor dili "utandırma" değil "şu adımı at". */
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
}

/**
 * Dosya verilen yollardan birinde var mı?
 * true = var, false = hiçbirinde yok, null = emin değiliz (yetki sorunu).
 */
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

/**
 * Lisans adını okunur hale getirir.
 *
 * GitHub, sınıflandıramadığı lisanslar için spdx_id alanına "NOASSERTION"
 * yazar. Bunu ekrana basmak kimseye bir şey anlatmaz; kullanıcı lisansın
 * bozuk olduğunu sanır. Oysa dosya vardır, GitHub sadece tanıyamamıştır.
 */
function licenseLabel(license: RepoInfo['license']): string {
  if (!license) return 'Yok';
  const spdx = license.spdx_id;
  if (spdx && spdx !== 'NOASSERTION') return spdx;
  if (license.name && license.name !== 'Other') return license.name;
  return 'Var, ancak GitHub türünü tanımlayamadı';
}

export async function securityScore(
  gh: GitHubClient,
  owner: string,
  repo: string,
): Promise<SecurityScoreResult> {
  const info = await gh.get<RepoInfo>(`/repos/${owner}/${repo}`);
  const criteria: Criterion[] = [];

  criteria.push({
    id: 'license',
    label: 'Lisans',
    weight: 10,
    status: info.license ? 'pass' : 'fail',
    detail: licenseLabel(info.license),
    fix: info.license
      ? undefined
      : 'Depoya bir LICENSE dosyası ekle; lisansı olmayan kod hukuken kullanılamaz.',
  });

  criteria.push({
    id: 'issues',
    label: 'Issue takibi',
    weight: 10,
    status: info.has_issues ? 'pass' : 'fail',
    detail: info.has_issues ? 'Açık' : 'Kapalı',
    fix: info.has_issues
      ? undefined
      : 'Issue sekmesini aç; güvenlik sorunlarının bildirilebileceği bir kanal olsun.',
  });

  criteria.push({
    id: 'wiki',
    label: 'Wiki',
    weight: 5,
    status: info.has_wiki ? 'pass' : 'fail',
    detail: info.has_wiki ? 'Açık' : 'Kapalı',
    fix: info.has_wiki
      ? undefined
      : 'Wiki’yi aç ya da dokümantasyonu README içinde topla.',
  });

  criteria.push({
    id: 'projects',
    label: 'Projects',
    weight: 5,
    status: info.has_projects ? 'pass' : 'fail',
    detail: info.has_projects ? 'Açık' : 'Kapalı',
    fix: info.has_projects
      ? undefined
      : 'Projects sekmesi açıkken yol haritası dışarıdan izlenebilir olur.',
  });

  const open = info.open_issues_count ?? 0;
  criteria.push({
    id: 'open_issues',
    label: 'Açık issue sayısı',
    weight: open > 50 ? 10 : 5,
    status: open > 10 ? 'fail' : 'pass',
    detail: String(open),
    fix:
      open > 10
        ? 'Biriken issue’ları triyaj et; içlerinde bekleyen bir güvenlik raporu olabilir.'
        : undefined,
  });

  // GitHub SECURITY.md dosyasını kökte, .github/ ve docs/ altında arar.
  // CLI yalnızca köke bakıyor; dosya .github/ altındaysa yanlış alarm veriyor.
  const hasSecurity = await fileExists(gh, owner, repo, [
    'SECURITY.md',
    '.github/SECURITY.md',
    'docs/SECURITY.md',
  ]);
  criteria.push({
    id: 'security_md',
    label: 'Güvenlik politikası',
    weight: 10,
    status: hasSecurity === null ? 'unknown' : hasSecurity ? 'pass' : 'fail',
    detail: hasSecurity === null ? 'Okunamadı' : hasSecurity ? 'Var' : 'Yok',
    fix:
      hasSecurity === false
        ? 'SECURITY.md ekle: açığı bulan biri sana nasıl ulaşacak, orada yazsın.'
        : undefined,
  });

  // --- Düzeltmenin uygulandığı yer ---
  const prot = await gh.raw(
    `/repos/${owner}/${repo}/branches/${info.default_branch}/protection`,
  );
  let protStatus: CriterionStatus;
  let protDetail: string;
  if (prot.status === 200) {
    protStatus = 'pass';
    protDetail = 'Etkin';
  } else if (prot.status === 404 && /not protected/i.test(prot.message ?? '')) {
    protStatus = 'fail';
    protDetail = 'Kapalı';
  } else {
    // 401/403 ya da başka bir 404: bu uç yalnızca admin'e açık, okuyamıyoruz.
    protStatus = 'unknown';
    protDetail = 'Bilinmiyor — bu bilgi yalnızca depo yöneticisine açık';
  }
  criteria.push({
    id: 'branch_protection',
    label: `Dal koruması (${info.default_branch})`,
    weight: 10,
    status: protStatus,
    detail: protDetail,
    fix:
      protStatus === 'fail'
        ? 'Ana dala koruma ekle: zorla push ve gözden geçirmesiz birleştirme kapansın.'
        : undefined,
  });

  const hasDependabot = await fileExists(gh, owner, repo, [
    '.github/dependabot.yml',
    '.github/dependabot.yaml',
  ]);
  criteria.push({
    id: 'dependabot',
    label: 'Dependabot yapılandırması',
    weight: 5,
    status: hasDependabot === null ? 'unknown' : hasDependabot ? 'pass' : 'fail',
    detail: hasDependabot === null ? 'Okunamadı' : hasDependabot ? 'Var' : 'Yok',
    fix:
      hasDependabot === false
        ? '.github/dependabot.yml ekle; bağımlılık güncellemeleri otomatik PR olarak gelsin.'
        : undefined,
  });

  const scan = await gh.raw<unknown[]>(`/repos/${owner}/${repo}/code-scanning/alerts`);
  let scanStatus: CriterionStatus;
  let scanDetail: string;
  if (scan.status === 200 && Array.isArray(scan.data)) {
    const n = scan.data.length;
    scanStatus = n > 0 ? 'fail' : 'pass';
    scanDetail = n > 0 ? `${n} açık uyarı` : 'Açık uyarı yok';
  } else if (scan.status === 404) {
    scanStatus = 'unknown';
    scanDetail = 'Kod taraması etkin değil';
  } else {
    scanStatus = 'unknown';
    scanDetail = 'Bilinmiyor — uyarılar herkese açık değil';
  }
  criteria.push({
    id: 'code_scanning',
    label: 'Kod taraması uyarıları',
    weight: 10,
    status: scanStatus,
    detail: scanDetail,
    fix: scanStatus === 'fail' ? 'Açık uyarıları gözden geçirip kapat.' : undefined,
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
