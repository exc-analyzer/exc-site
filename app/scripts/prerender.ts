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
  disputed_at?: string | null;
  disputed_note?: string | null;
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
};
interface MemberRow {
  id: string;
  gh_login: string;
  accent: string;
  bio: string | null;
  created_at: string;
  shown_name: string;
  post_count: number;
  scan_count: number;
  comment_count: number;
  follower_count: number;
}

interface PinRow {
  owner_id: string;
  owner: string;
  repo: string;
  note: string | null;
  position: number;
}

interface FeedRow {
  kind: string;
  id: string;
  author_login: string | null;
  happened_at: string;
}

async function fetchFeed(): Promise<FeedRow[]> {
  const url = new URL('/rest/v1/feed', SUPABASE_URL);
  url.searchParams.set('select', 'kind,id,author_login,happened_at');
  url.searchParams.set('order', 'happened_at.desc');
  url.searchParams.set('limit', '500');
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return [];
  return (await res.json()) as FeedRow[];
}

async function fetchMembers(): Promise<MemberRow[]> {
  const url = new URL('/rest/v1/member_profile', SUPABASE_URL);
  url.searchParams.set(
    'select',
    'id,gh_login,accent,bio,created_at,shown_name,post_count,scan_count,comment_count,follower_count',
  );
  url.searchParams.set('private_account', 'is.false');
  url.searchParams.set('limit', '500');
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return [];
  return (await res.json()) as MemberRow[];
}

async function fetchPins(): Promise<PinRow[]> {
  const url = new URL('/rest/v1/pinned_repos', SUPABASE_URL);
  url.searchParams.set('select', 'owner_id,owner,repo,note,position');
  url.searchParams.set('order', 'position.asc');
  url.searchParams.set('limit', '1500');
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return [];
  return (await res.json()) as PinRow[];
}

async function fetchReports(): Promise<Report[]> {
  const url = new URL('/rest/v1/report_card', SUPABASE_URL);
  url.searchParams.set(
    'select',
    'id,owner,repo,kind,score,summary,scan_count,updated_at,disputed_at,disputed_note',
  );
  url.searchParams.set('order', 'updated_at.desc');
  url.searchParams.set('limit', String(MAX_PAGES));
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  }
  const rows = (await res.json()) as Report[];
  const clean = rows.filter((r) => nameIsSafe(r.owner, r.repo));
  if (clean.length !== rows.length) {
    console.warn(
      `Skipped ${rows.length - clean.length} report(s) whose owner or repository name is not a plain GitHub name.`,
    );
  }
  return clean;
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
  const title = `${target} — ${kindName} · EXC`;
  const description = describe(report);
  const canonical = `${SITE}${reportUrl(report)}`;
  const head = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:image" content="${escapeHtml(cardSrc(report.owner, report.repo, report.updated_at.slice(0, 10)))}">`,
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
      ${
        report.disputed_at
          ? `<p><strong>Disputed.</strong> ${escapeHtml(
              report.disputed_note ??
                'Somebody has told us this result is wrong. It is being looked at.',
            )}</p>`
          : ''
      }
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

  const headline =
    score === null
      ? `${target.reports.length} report${target.reports.length === 1 ? '' : 's'} on record`
      : `${score}/100 on the public checks`;

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
    return `<li><a href="${escapeHtml(reportUrl(report))}">${escapeHtml(name)}</a>${score} · updated ${escapeHtml(report.updated_at.slice(0, 10))}</li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

function buildHub(shell: string, target: Target): string {
  const label = target.repo ? `${target.owner}/${target.repo}` : target.owner;
  const title = `${label} · EXC`;
  const description = hubDescription(target);
  const canonical = `${SITE}${hubUrl(target)}`;
  const head = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:image" content="${escapeHtml(cardSrc(target.owner, target.repo, cardVersion(target.reports)))}">`,
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

function memberUrl(login: string): string {
  return `/app/people/${login}/`;
}

function memberCardPath(login: string): string {
  return `/og/p/${login}.png`;
}

function memberDescription(member: MemberRow, pins: PinRow[]): string {
  const bio = member.bio?.trim();
  if (bio) return bio.length > 180 ? `${bio.slice(0, 177)}…` : bio;
  const looks = pins.length > 0 ? ` Looks after ${pins.map((p) => `${p.owner}/${p.repo}`).join(', ')}.` : '';
  return `${member.shown_name} on EXC: ${member.scan_count} scan${member.scan_count === 1 ? '' : 's'}, ${member.post_count} post${member.post_count === 1 ? '' : 's'} and ${member.comment_count} repl${member.comment_count === 1 ? 'y' : 'ies'}.${looks}`;
}

function memberCard(member: MemberRow, pins: PinRow[]): CardData {
  const facts: CardFact[] = pins.slice(0, 2).map((pin) => ({ text: `${pin.owner}/${pin.repo}` }));
  if (facts.length < 3) {
    facts.push({ text: `${member.scan_count} scan${member.scan_count === 1 ? '' : 's'}` });
  }
  if (facts.length < 3) {
    facts.push({ text: `${member.post_count} post${member.post_count === 1 ? '' : 's'}` });
  }
  return {
    label: `@${member.gh_login}`,
    score: null,
    headline: member.shown_name,
    facts: facts.slice(0, 3),
    url: `${SITE.replace(/^https?:\/\//, '')}${memberUrl(member.gh_login)}`.replace(/\/$/, ''),
    tagline: 'Who is looking at what',
  };
}

function buildMember(shell: string, member: MemberRow, pins: PinRow[]): string {
  const title = `${member.shown_name} (@${member.gh_login}) · EXC`;
  const description = memberDescription(member, pins);
  const canonical = `${SITE}${memberUrl(member.gh_login)}`;
  const head = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:image" content="${escapeHtml(`${SITE}${memberCardPath(member.gh_login)}?v=${member.created_at.slice(0, 10)}`)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join('\n    ');

  const pinList =
    pins.length > 0
      ? `<ul>${pins
          .map(
            (pin) =>
              `<li><a href="/app/r/${pin.owner}/${pin.repo}/">${escapeHtml(`${pin.owner}/${pin.repo}`)}</a>${
                pin.note ? ` — ${escapeHtml(pin.note)}` : ''
              }</li>`,
          )
          .join('')}</ul>`
      : '';

  const readable = `
    <div id="exc-prerendered">
      <h1>${escapeHtml(member.shown_name)}</h1>
      <p>${escapeHtml(description)}</p>
      ${pinList}
      <p><a href="https://github.com/${escapeHtml(member.gh_login)}">@${escapeHtml(member.gh_login)} on GitHub</a></p>
    </div>`;

  return shell
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta\s+name="description"[^>]*>/, '')
    .replace(/\s*<meta\s+(?:property="og:|name="twitter:)[^>]*>/g, '')
    .replace('</head>', `    ${head}\n  </head>`)
    .replace(/(<body[^>]*>)/, `$1${readable}`);
}

const OWNER_SHAPE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_SHAPE = /^[A-Za-z0-9._-]{1,100}$/;

function nameIsSafe(owner: string, repo: string): boolean {
  if (!OWNER_SHAPE.test(owner)) return false;
  if (repo !== '' && !REPO_SHAPE.test(repo)) return false;
  return repo !== '.' && repo !== '..';
}

async function writeFile(relativePath: string, content: string): Promise<void> {
  const full = path.resolve(PUBLIC_DIR, relativePath);
  const root = path.resolve(PUBLIC_DIR);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`Refused to write outside the public directory: ${relativePath}`);
  }
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}
async function main(): Promise<void> {
  const reports = await fetchReports();
  console.log(`Fetched ${reports.length} reports.`);

  const shell = await fs.readFile(path.join(PUBLIC_DIR, 'app/r/index.html'), 'utf8');

  await fs.rm(path.join(PUBLIC_DIR, 'badge'), { recursive: true, force: true });
  await fs.rm(path.join(PUBLIC_DIR, 'app/r'), { recursive: true, force: true });
  await fs.rm(path.join(PUBLIC_DIR, 'og/r'), { recursive: true, force: true });
  await fs.rm(path.join(PUBLIC_DIR, 'og/p'), { recursive: true, force: true });
  await fs.rm(path.join(PUBLIC_DIR, 'og/u'), { recursive: true, force: true });
  await writeFile('app/r/index.html', shell);
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
  const members = await fetchMembers();
  const pinRows = await fetchPins();
  const pinsByOwner = new Map<string, PinRow[]>();
  for (const pin of pinRows) {
    const list = pinsByOwner.get(pin.owner_id) ?? [];
    list.push(pin);
    pinsByOwner.set(pin.owner_id, list);
  }

  const peopleShell = await fs.readFile(path.join(PUBLIC_DIR, 'app/people/index.html'), 'utf8');
  for (const member of members) {
    const theirPins = pinsByOwner.get(member.id) ?? [];
    const url = memberUrl(member.gh_login);
    await writeFile(
      `${url.replace(/^\//, '').replace(/\/$/, '')}/index.html`,
      buildMember(peopleShell, member, theirPins),
    );
    pages += 1;
  }

  const cards = targets.map((target) => ({
    data: cardFor(target),
    outPath: cardPath(target.owner, target.repo).replace(/^\//, ''),
  }));
  for (const member of members) {
    cards.push({
      data: memberCard(member, pinsByOwner.get(member.id) ?? []),
      outPath: memberCardPath(member.gh_login).replace(/^\//, ''),
    });
  }
  cards.push({
    data: {
      label: 'EXC',
      score: null,
      headline: 'Rate a repository before you depend on it',
      facts: [{ text: 'Security score' }, { text: 'Content audit' }, { text: 'Actions audit' }],
      url: `${SITE.replace(/^https?:\/\//, '')}/app`,
    },
    outPath: 'og/default.png',
  });
  const written = await renderCards(cards, PUBLIC_DIR);
  console.log(`Rendered ${written} share cards.`);

  const feedRows = await fetchFeed();
  const posts = feedRows.filter((row) => row.kind === 'post');
  const lastSeen = new Map<string, string>();
  for (const row of feedRows) {
    if (!row.author_login) continue;
    const seen = lastSeen.get(row.author_login);
    const day = row.happened_at.slice(0, 10);
    if (!seen || day > seen) lastSeen.set(row.author_login, day);
  }
  const people = members.map((member) => member.gh_login);

  for (const post of posts) {
    urls.push({ loc: `${SITE}/app/p/${post.id}/`, lastmod: post.happened_at.slice(0, 10) });
  }
  for (const member of members) {
    urls.push({
      loc: `${SITE}${memberUrl(member.gh_login)}`,
      lastmod: lastSeen.get(member.gh_login) ?? member.created_at.slice(0, 10),
    });
  }
  urls.unshift({ loc: `${SITE}/app/explore/`, lastmod: new Date().toISOString().slice(0, 10) });

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
  console.log(
    `Wrote ${badges} badges, ${pages} pages (${targets.length} hubs) and ${urls.length} sitemap entries, ${posts.length} of them posts and ${people.length} people.`,
  );
}
await main();