/**
 * Gecelik iş: rozet dosyaları, önceden üretilmiş rapor sayfaları ve site haritası.
 *
 * Üç işi birden yapıyor ve üçü de büyümenin altyapısı:
 *
 *  1. ROZET — README'ye konulacak rozetin adresi sonsuza kadar sabit kalmalı,
 *     çünkü başkalarının depolarına gömülüyor. Bu yüzden shields.io'nun
 *     "endpoint" biçiminde statik JSON üretiyoruz. Supabase'e doğrudan
 *     bağlanan dinamik bir rozet adresi de mümkündü ama o adres anahtarı
 *     içerir ve anahtar değişirse herkesin rozeti kırılır.
 *
 *  2. ÖNCEDEN ÜRETİM — rapor sayfaları tarayıcıda çiziliyor. Arama motorları
 *     JavaScript çalıştırıyor ama hazır HTML'i çok daha güvenilir okuyor.
 *     Her rapor için başlık, açıklama, paylaşım etiketleri ve okunabilir bir
 *     özet içeren statik sayfa üretiliyor; uygulama yüklendiğinde yerini
 *     etkileşimli sürüme bırakıyor.
 *
 *  3. SUPABASE'İ UYANIK TUTMA — ücretsiz proje bir hafta hareketsiz kalırsa
 *     duraklatılıyor. Bu iş her gece veritabanına dokunduğu için o hiç
 *     gerçekleşmiyor. Yan etki değil, bilinçli bir görev.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;
const SITE = process.env.PUBLIC_SITE_URL ?? 'https://exc-analyzer.web.app';

/** Kaç rapor önceden üretilsin. Dosya sayısı arttıkça deploy yavaşlar. */
const MAX_PAGES = Number(process.env.PRERENDER_LIMIT ?? 500);

const PUBLIC_DIR = path.resolve('../public');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('PUBLIC_SUPABASE_URL ve PUBLIC_SUPABASE_ANON_KEY gerekli.');
  process.exit(1);
}

interface Report {
  id: string;
  owner: string;
  repo: string;
  kind: string;
  score: number | null;
  summary: Record<string, unknown>;
  scan_count: number;
  updated_at: string;
}

const KIND_NAMES: Record<string, string> = {
  analysis: 'Depo analizi',
  'security-score': 'Güvenlik puanı',
  'content-audit': 'İçerik denetimi',
  'contrib-impact': 'Katkı etkisi',
  'file-history': 'Dosya geçmişi',
  'actions-audit': 'Actions denetimi',
  'commit-anomaly': 'Commit anomalisi',
  'user-analysis': 'Kullanıcı analizi',
  'user-anomaly': 'Kullanıcı anomalisi',
};

async function fetchReports(): Promise<Report[]> {
  const url = new URL('/rest/v1/reports', SUPABASE_URL);
  url.searchParams.set('select', 'id,owner,repo,kind,score,summary,scan_count,updated_at');
  url.searchParams.set('order', 'updated_at.desc');
  url.searchParams.set('limit', String(MAX_PAGES));

  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as Report[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badgeColor(score: number): string {
  if (score >= 90) return 'brightgreen';
  if (score >= 75) return 'yellow';
  if (score >= 50) return 'orange';
  return 'red';
}

/** Rapor türüne göre arama sonucunda görünecek açıklama. */
function describe(report: Report): string {
  const target = report.repo ? `${report.owner}/${report.repo}` : report.owner;
  const s = report.summary as Record<string, unknown>;

  switch (report.kind) {
    case 'security-score':
      return `${target} güvenlik puanı: ${report.score}/100. Lisans, güvenlik politikası, dal koruması ve bağımlılık güncellemeleri değerlendirildi.`;
    case 'analysis': {
      const stars = typeof s.stars === 'number' ? s.stars : 0;
      const langs = Array.isArray(s.languages) ? (s.languages as { name: string }[]) : [];
      const main = langs[0]?.name;
      return `${target} deposunun genel durumu: ${stars} yıldız${main ? `, ağırlıklı dil ${main}` : ''}, katkıda bulunanlar ve commit dağılımı.`;
    }
    case 'content-audit':
      return `${target} topluluk standartları denetimi: LICENSE, SECURITY.md, CONTRIBUTING ve README durumu.`;
    case 'actions-audit':
      return `${target} GitHub Actions iş akışlarında tedarik zinciri ve script enjeksiyonu riskleri.`;
    case 'user-anomaly':
      return `${target} hesabının davranış analizi. Risk puanı: ${report.score}/100.`;
    default:
      return `${target} için ${KIND_NAMES[report.kind] ?? report.kind} raporu.`;
  }
}

/**
 * Arama motorunun ve paylaşım önizlemesinin göreceği okunabilir özet.
 * Uygulama yüklenince bu blok yerini etkileşimli sürüme bırakıyor.
 */
function summaryHtml(report: Report): string {
  const s = report.summary as Record<string, unknown>;
  const rows: string[] = [];

  if (report.kind === 'security-score' && Array.isArray(s.criteria)) {
    for (const c of s.criteria as { label: string; detail: string; status: string }[]) {
      const mark = c.status === 'pass' ? '✓' : c.status === 'fail' ? '✕' : '–';
      rows.push(`<li>${mark} ${escapeHtml(c.label)}: ${escapeHtml(c.detail)}</li>`);
    }
  } else if (report.kind === 'content-audit' && Array.isArray(s.items)) {
    for (const i of s.items as { file: string; qualityLabel: string }[]) {
      rows.push(`<li>${escapeHtml(i.file)}: ${escapeHtml(i.qualityLabel)}</li>`);
    }
  } else if (report.kind === 'analysis') {
    if (typeof s.stars === 'number') rows.push(`<li>Yıldız: ${s.stars}</li>`);
    if (typeof s.forks === 'number') rows.push(`<li>Fork: ${s.forks}</li>`);
    if (typeof s.license === 'string') rows.push(`<li>Lisans: ${escapeHtml(s.license)}</li>`);
  }

  return rows.length > 0 ? `<ul>${rows.join('')}</ul>` : '';
}

function reportUrl(report: Report): string {
  return report.repo
    ? `/app/r/${report.owner}/${report.repo}/${report.kind}`
    : `/app/u/${report.owner}/${report.kind}`;
}

/**
 * Uygulama kabuğuna arama motoru için gereken başlıkları ve okunabilir
 * içeriği enjekte eder.
 */
function buildPage(shell: string, report: Report): string {
  const target = report.repo ? `${report.owner}/${report.repo}` : report.owner;
  const kindName = KIND_NAMES[report.kind] ?? report.kind;
  const title = `${target} — ${kindName} · EXC Analyzer`;
  const description = describe(report);
  const canonical = `${SITE}${reportUrl(report)}`;

  const head = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta name="twitter:card" content="summary">`,
  ].join('\n    ');

  // Kabuktaki mevcut <title> ve description degistirilir, digerleri eklenir.
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta\s+name="description"[^>]*>/, '')
    .replace('</head>', `    ${head}\n  </head>`);

  const readable = `
    <div id="exc-prerendered">
      <h1>${escapeHtml(target)} — ${escapeHtml(kindName)}</h1>
      <p>${escapeHtml(description)}</p>
      ${summaryHtml(report)}
      <p>Son güncelleme: ${report.updated_at.slice(0, 10)} · ${report.scan_count} kez tarandı</p>
    </div>`;

  // Uygulama yuklendiginde bu blogu kaldiriyor; JavaScript kapaliysa
  // ziyaretci yine de icerigi goruyor.
  html = html.replace('<body', `${readable ? '' : ''}<body`);
  html = html.replace(/(<body[^>]*>)/, `$1${readable}`);

  return html;
}

async function writeFile(relativePath: string, content: string): Promise<void> {
  const full = path.join(PUBLIC_DIR, relativePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

async function main(): Promise<void> {
  const reports = await fetchReports();
  console.log(`${reports.length} rapor alındı.`);

  const shell = await fs.readFile(path.join(PUBLIC_DIR, 'app/r/index.html'), 'utf8');

  let badges = 0;
  let pages = 0;
  const urls: { loc: string; lastmod: string }[] = [];

  for (const report of reports) {
    // 1. Rozet — yalnizca guvenlik puani icin anlamli.
    if (report.kind === 'security-score' && report.score !== null && report.repo) {
      await writeFile(
        `badge/${report.owner}/${report.repo}.json`,
        JSON.stringify({
          schemaVersion: 1,
          label: 'EXC güvenlik',
          message: String(report.score),
          color: badgeColor(report.score),
        }),
      );
      badges += 1;
    }

    // 2. Onceden uretilmis sayfa.
    const url = reportUrl(report);
    await writeFile(`${url.replace(/^\//, '')}/index.html`, buildPage(shell, report));
    pages += 1;

    urls.push({ loc: `${SITE}${url}`, lastmod: report.updated_at.slice(0, 10) });
  }

  // 3. Site haritasi.
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${SITE}/</loc></url>`,
    `  <url><loc>${SITE}/app/</loc></url>`,
    ...urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`),
    '</urlset>',
  ].join('\n');
  await writeFile('sitemap.xml', sitemap);

  await writeFile(
    'robots.txt',
    ['User-agent: *', 'Allow: /', `Sitemap: ${SITE}/sitemap.xml`, ''].join('\n'),
  );

  console.log(`${badges} rozet, ${pages} sayfa, ${urls.length} adres site haritasına yazıldı.`);
}

await main();
