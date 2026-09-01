import fs from 'node:fs/promises';
import path from 'node:path';
import { renderCards, type CardData, type CardFact } from './card';
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;
const SITE = process.env.PUBLIC_SITE_URL ?? 'https://exc-analyzer.web.app';
const MAX_PAGES = Number(process.env.PRERENDER_LIMIT ?? 500);
const PUBLIC_DIR = path.resolve('../public');
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY are required.');
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
    if (typeof s.license === 'string') rows.push(`<li>License: ${escapeHtml(s.license)}</li>`);
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
    `<meta property="og:image" content="${cardSrc(report.owner, report.repo, report.updated_at.slice(0, 10))}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join('\n    ');
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta\s+name="description"[^>]*>/, '')
    .replace(/\s*<meta\s+(?:property="og:|name="twitter:)[^>]*>/g, '')
    .replace('</head>', `    ${head}\n  </head>`);
  const readable = `
    <div id="exc-prerendered">
      <h1>${escapeHtml(target)} — ${escapeHtml(kindName)}</h1>
      <p>${escapeHtml(description)}</p>
      ${summaryHtml(report)}
      <p>Last updated ${report.updated_at.slice(0, 10)} · scanned ${report.scan_count} times</p>
    </div>`;

  html = html.replace(/(<body[^>]*>)/, `$1${readable}`);
  return html;
}
interface Target {
  owner: string;
  repo: string;
  reports: Report[];
}

function groupTargets(reports: Report[]): Target[] {
  const map = new Map<string, Target>();
  for (const report of reports) {
    const key = `${report.owner}/${report.repo}`;
    const found = map.get(key);
    if (found) found.reports.push(report);
    else map.set(key, { owner: report.owner, repo: report.repo, reports: [report] });
  }
  for (const target of map.values()) {
    target.reports.sort((a, b) => a.kind.localeCompare(b.kind));
  }
  return [...map.values()];
}

function cardPath(owner: string, repo: string): string {
  return repo ? `/og/r/${owner}/${repo}.png` : `/og/u/${owner}.png`;
}

function cardVersion(reports: Report[]): string {
  return reports
    .map((r) => r.updated_at.slice(0, 10))
    .sort()
    .at(-1)!;
}

function cardSrc(owner: string, repo: string, version: string): string {
  return `${SITE}${cardPath(owner, repo)}?v=${version}`;
}

function cardFor(target: Target): CardData {
  const label = target.repo ? `${target.owner}/${target.repo}` : target.owner;
  const security = target.reports.find((r) => r.kind === 'security-score');
  const score = security?.score ?? null;

  let headline: string;
  if (score === null) {
    headline = `${target.reports.length} report${target.reports.length === 1 ? '' : 's'} on record`;
  } else if (score >= 90) {
    headline = 'Well defended';
  } else if (score >= 75) {
    headline = 'The basics are there, a few gaps remain';
  } else {
    headline = 'Several important things are missing';
  }

  const facts: CardFact[] = [];
  if (security) {
    const s = security.summary as Record<string, unknown>;
    const criteria = Array.isArray(s.criteria) ? (s.criteria as { label: string; status: string }[]) : [];
    const failing = criteria.filter((c) => c.status === 'fail');
    if (failing.length === 0 && criteria.length > 0) facts.push({ text: 'Every criterion met' });
    for (const c of failing.slice(0, 2)) facts.push({ text: `No ${c.label.toLowerCase()}`, missing: true });
    if (failing.length > 2) facts.push({ text: `+${failing.length - 2} more`, missing: true });
  }
  const content = target.reports.find((r) => r.kind === 'content-audit');
  if (content) {
    const s = content.summary as Record<string, unknown>;
    const present = Number(s.presentCount ?? 0);
    const total = Number(s.totalCount ?? 0);
    facts.push({ text: `${present}/${total} standard files`, missing: present < total });
  }
  if (facts.length === 0) {
    facts.push(...target.reports.slice(0, 3).map((r) => ({ text: KIND_NAMES[r.kind] ?? r.kind })));
  }

  return {
    label,
    score,
    headline,
    facts: facts.slice(0, 3),
    url: `${SITE.replace(/^https?:\/\//, '')}${hubUrl(target)}`.replace(/\/$/, ''),
  };
}

function hubUrl(target: Target): string {
  return target.repo ? `/app/r/${target.owner}/${target.repo}/` : `/app/u/${target.owner}/`;
}

function hubDescription(target: Target): string {
  const label = target.repo ? `${target.owner}/${target.repo}` : target.owner;
  const security = target.reports.find((r) => r.kind === 'security-score');
  const names = target.reports.map((r) => KIND_NAMES[r.kind] ?? r.kind).join(', ');
  const count = target.reports.length;
  const plural = count === 1 ? 'report' : 'reports';
  if (security && security.score !== null) {
    return `${label} scores ${security.score}/100 on security. ${count} ${plural} so far: ${names}.`;
  }
  return `Everything known about ${label}: ${count} ${plural} so far — ${names}.`;
}

function hubSummaryHtml(target: Target): string {
  const items = target.reports.map((report) => {
    const name = KIND_NAMES[report.kind] ?? report.kind;
    const score = report.score !== null ? ` — ${report.score}/100` : '';
    return `<li><a href="${reportUrl(report)}">${escapeHtml(name)}</a>${score} · updated ${report.updated_at.slice(0, 10)}</li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

function buildHub(shell: string, target: Target): string {
  const label = target.repo ? `${target.owner}/${target.repo}` : target.owner;
  const title = `${label} · EXC Analyzer`;
  const description = hubDescription(target);
  const canonical = `${SITE}${hubUrl(target)}`;
  const head = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${cardSrc(target.owner, target.repo, cardVersion(target.reports))}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join('\n    ');
  const readable = `
    <div id="exc-prerendered">
      <h1>${escapeHtml(label)}</h1>
      <p>${escapeHtml(description)}</p>
      ${hubSummaryHtml(target)}
      <p><a href="https://github.com/${escapeHtml(label)}">View on GitHub</a></p>
    </div>`;
  return shell
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta\s+name="description"[^>]*>/, '')
    .replace(/\s*<meta\s+(?:property="og:|name="twitter:)[^>]*>/g, '')
    .replace('</head>', `    ${head}\n  </head>`)
    .replace(/(<body[^>]*>)/, `$1${readable}`);
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

  const targets = groupTargets(reports);
  for (const target of targets) {
    const url = hubUrl(target);
    await writeFile(`${url.replace(/^\//, '').replace(/\/$/, '')}/index.html`, buildHub(shell, target));
    pages += 1;
    const lastmod = target.reports
      .map((r) => r.updated_at.slice(0, 10))
      .sort()
      .at(-1)!;
    urls.unshift({ loc: `${SITE}${url}`, lastmod });
  }
  const cards = targets.map((target) => ({
    data: cardFor(target),
    outPath: cardPath(target.owner, target.repo).replace(/^\//, ''),
  }));
  cards.push({
    data: {
      label: 'EXC Analyzer',
      score: null,
      headline: 'Rate a repository before you depend on it',
      facts: [{ text: 'Security score' }, { text: 'Content audit' }, { text: 'Actions audit' }],
      url: `${SITE.replace(/^https?:\/\//, '')}/app`,
    },
    outPath: 'og/default.png',
  });
  const written = await renderCards(cards, PUBLIC_DIR);
  console.log(`Rendered ${written} share cards.`);

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
  console.log(`Wrote ${badges} badges, ${pages} pages (${targets.length} hubs) and ${urls.length} sitemap entries.`);
}
await main();