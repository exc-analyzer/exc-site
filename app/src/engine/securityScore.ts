/**
 * Depo guvenlik puanlamasi.
 *
 * Kaynak: exc_analyzer/commands/security_score.py
 *
 * CLI'ye gore tek davranis farki bilincli bir DUZELTMEdir:
 *
 *   CLI, branch protection ucundan 200 disinda bir yanit alirsa 10 puan
 *   dusuruyor. Ama o uc yalnizca depoya admin erisimi olanlara aciktir;
 *   baskasinin deposunda 403/404 doner. Yani CLI, sahibi olmadigin her depoyu
 *   haksiz yere cezalandiriyor. Web'de taramalarin nerdeyse tamami baskasinin
 *   deposunda calisacagi icin bu, her raporu yaniltici hale getirirdi.
 *
 *   Burada "bilinmiyor" ile "kapali" ayriliyor: GitHub 404 + "Branch not
 *   protected" derse depo gercekten korumasizdir ve puan duser. Yetki
 *   yetersizligi nedeniyle okunamiyorsa kriter puanlamadan tamamen cikarilir
 *   ve raporda "bilinmiyor" olarak gosterilir.
 *
 * Ayni duzeltme CLI'ye de uygulanmalidir.
 */
import { GitHubClient } from '../lib/github';

export type CriterionStatus = 'pass' | 'fail' | 'unknown';

export interface Criterion {
  id: string;
  label: string;
  weight: number;
  status: CriterionStatus;
  detail: string;
  /** Nasil duzeltilir. Rapor dili "utandirma" degil "su adimi at". */
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
  license: { spdx_id?: string | null; name?: string } | null;
  has_issues: boolean;
  has_wiki: boolean;
  has_projects: boolean;
  open_issues_count: number;
  default_branch: string;
}

/**
 * Dosya verilen yollardan birinde var mi?
 * true = var, false = hicbirinde yok, null = emin degiliz (yetki sorunu).
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
    detail: info.license?.spdx_id ?? info.license?.name ?? 'Yok',
    fix: info.license
      ? undefined
      : 'Depoya bir LICENSE dosyasi ekle; lisansi olmayan kod hukuken kullanilamaz.',
  });

  criteria.push({
    id: 'issues',
    label: 'Issue takibi',
    weight: 10,
    status: info.has_issues ? 'pass' : 'fail',
    detail: info.has_issues ? 'Acik' : 'Kapali',
    fix: info.has_issues
      ? undefined
      : 'Issue sekmesini ac; guvenlik sorunlarinin bildirilebilecegi bir kanal olsun.',
  });

  criteria.push({
    id: 'wiki',
    label: 'Wiki',
    weight: 5,
    status: info.has_wiki ? 'pass' : 'fail',
    detail: info.has_wiki ? 'Acik' : 'Kapali',
    fix: info.has_wiki ? undefined : 'Wikiyi ac ya da dokumantasyonu README icinde topla.',
  });

  criteria.push({
    id: 'projects',
    label: 'Projects',
    weight: 5,
    status: info.has_projects ? 'pass' : 'fail',
    detail: info.has_projects ? 'Acik' : 'Kapali',
    fix: info.has_projects ? undefined : 'Projects sekmesi acikken yol haritasi izlenebilir olur.',
  });

  const open = info.open_issues_count ?? 0;
  criteria.push({
    id: 'open_issues',
    label: 'Acik issue sayisi',
    weight: open > 50 ? 10 : 5,
    status: open > 10 ? 'fail' : 'pass',
    detail: String(open),
    fix:
      open > 10
        ? 'Biriken issuelari triyaj et; iclerinde bekleyen bir guvenlik raporu olabilir.'
        : undefined,
  });

  // GitHub SECURITY.md dosyasini kokte, .github/ ve docs/ altinda arar.
  // CLI yalnizca koke bakiyor; dosya .github/ altindaysa yanlis alarm veriyor.
  const hasSecurity = await fileExists(gh, owner, repo, [
    'SECURITY.md',
    '.github/SECURITY.md',
    'docs/SECURITY.md',
  ]);
  criteria.push({
    id: 'security_md',
    label: 'Guvenlik politikasi',
    weight: 10,
    status: hasSecurity === null ? 'unknown' : hasSecurity ? 'pass' : 'fail',
    detail: hasSecurity === null ? 'Okunamadi' : hasSecurity ? 'Var' : 'Yok',
    fix:
      hasSecurity === false
        ? 'SECURITY.md ekle: acigi bulan biri sana nasil ulasacak, orada yazsin.'
        : undefined,
  });

  // --- Duzeltmenin uygulandigi yer ---
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
    protDetail = 'Kapali';
  } else {
    // 403 ya da baska bir 404: bu uc yalnizca admin'e acik, okuyamiyoruz.
    protStatus = 'unknown';
    protDetail = 'Bilinmiyor (yalnizca depo yoneticisine acik)';
  }
  criteria.push({
    id: 'branch_protection',
    label: `Dal korumasi (${info.default_branch})`,
    weight: 10,
    status: protStatus,
    detail: protDetail,
    fix:
      protStatus === 'fail'
        ? 'Ana dala koruma ekle: zorla push ve gozden gecirmesiz birlestirme kapansin.'
        : undefined,
  });

  const hasDependabot = await fileExists(gh, owner, repo, [
    '.github/dependabot.yml',
    '.github/dependabot.yaml',
  ]);
  criteria.push({
    id: 'dependabot',
    label: 'Dependabot yapilandirmasi',
    weight: 5,
    status: hasDependabot === null ? 'unknown' : hasDependabot ? 'pass' : 'fail',
    detail: hasDependabot === null ? 'Okunamadi' : hasDependabot ? 'Var' : 'Yok',
    fix:
      hasDependabot === false
        ? '.github/dependabot.yml ekle; bagimlilik guncellemeleri otomatik PR olarak gelsin.'
        : undefined,
  });

  const scan = await gh.raw<unknown[]>(`/repos/${owner}/${repo}/code-scanning/alerts`);
  let scanStatus: CriterionStatus;
  let scanDetail: string;
  if (scan.status === 200 && Array.isArray(scan.data)) {
    const n = scan.data.length;
    scanStatus = n > 0 ? 'fail' : 'pass';
    scanDetail = n > 0 ? `${n} acik uyari` : 'Acik uyari yok';
  } else if (scan.status === 404) {
    scanStatus = 'unknown';
    scanDetail = 'Kod taramasi etkin degil';
  } else {
    scanStatus = 'unknown';
    scanDetail = 'Bilinmiyor (uyarilar herkese acik degil)';
  }
  criteria.push({
    id: 'code_scanning',
    label: 'Kod taramasi uyarilari',
    weight: 10,
    status: scanStatus,
    detail: scanDetail,
    fix: scanStatus === 'fail' ? 'Acik uyarilari gozden gecirip kapat.' : undefined,
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
