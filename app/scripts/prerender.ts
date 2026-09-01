import fs from 'node:fs/promises';
import path from 'node:path';
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;
const SITE = process.env.PUBLIC_SITE_URL ?? 'https://exc-analyzer.web.app';
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
  analysis: 'Repository analysis',
  'security-score': 'Security score',
  'content-audit': 'Content audit',
  'contrib-impact': 'Contribution impact',
  'file-history': 'File history',
  'actions-audit': 'Actions audit',
  'commit-anomaly': 'Commit anomaly',
  'user-analysis': 'User analysis',
  'user-anomaly': 'User anomaly',
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
function describe(report: Report): string {
  const target = report.repo ? `${report.owner}/${report.repo}` : report.owner;
  const s = report.summary as Record<string, unknown>;

  switch (report.kind) {
    case 'security-score':
      return `${target} scores ${report.score}/100 on security. License, security policy, branch protection and dependency updates were all checked.`;
    case 'analysis': {
      const stars = typeof s.stars === 'number' ? s.stars : 0;
      const langs = Array.isArray(s.languages) ? (s.languages as { name: string }[]) : [];
      const main = langs[0]?.name;
      return `Where ${target} stands: ${stars} stars${main ? `, mostly ${main}` : ''}, plus contributors and commit distribution.`;
    }
    case 'content-audit':
      return `Community standards for ${target}: the state of LICENSE, SECURITY.md, CONTRIBUTING and README.`;
    case 'actions-audit':
      return `Supply-chain and script-injection risks in the GitHub Actions workflows of ${target}.`;
    case 'user-anomaly':
      return `Behaviour analysis for the ${target} account. Risk score: ${report.score}/100.`;
    default:
      return `${KIND_NAMES[report.kind] ?? report.kind} report for ${target}.`;
  }
}

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
    if (typeof s.stars === 'number') rows.push(`<li>Stars: ${s.stars}</li>`);
    if (typeof s.forks === 'number') rows.push(`<li>Fork: ${s.forks}</li>`);
    if (typeof s.license === 'string') rows.push(`<li>Lisans: ${escapeHtml(s.license)}</li>`);
  }

  return rows.length > 0 ? `<ul>${rows.join('')}</ul>` : '';
}
function reportUrl(report: Report): string {
  return report.repo
    ? `/app/r/${report.owner}/${report.repo}/${report.kind}/`
    : `/app/u/${report.owner}/${report.kind}/`;
}
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
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta\s+name="description"[^>]*>/, '')
    .replace('</head>', `    ${head}\n  </head>`);
  const readable = `
    <div id="exc-prerendered">
      <h1>${escapeHtml(target)} — ${escapeHtml(kindName)}</h1>
      <p>${escapeHtml(description)}</p>
      ${summaryHtml(report)}
      <p>Last updated ${report.updated_at.slice(0, 10)} · scanned ${report.scan_count} times</p>
    </div>`;

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
  console.log(`Fetched ${reports.length} reports.`);

  const shell = await fs.readFile(path.join(PUBLIC_DIR, 'app/r/index.html'), 'utf8');
  let badges = 0;
  let pages = 0;
  const urls: { loc: string; lastmod: string }[] = [];
  for (const report of reports) {

    if (report.kind === 'security-score' && report.score !== null && report.repo) {
      await writeFile(
        `badge/${report.owner}/${report.repo}.json`,
        JSON.stringify({
          schemaVersion: 1,
          label: 'EXC security',
          message: String(report.score),
          color: badgeColor(report.score),
        }),
      );
      badges += 1;
    }

    const url = reportUrl(report);
    await writeFile(`${url.replace(/^\//, '').replace(/\/$/, '')}/index.html`, buildPage(shell, report));
    pages += 1;

    urls.push({ loc: `${SITE}${url}`, lastmod: report.updated_at.slice(0, 10) });
  }
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
  console.log(`Wrote ${badges} badges, ${pages} pages and ${urls.length} sitemap entries.`);
}
await main();