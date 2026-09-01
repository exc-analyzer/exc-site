const URL_BASE = process.env.PUBLIC_SUPABASE_URL;
const KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;
if (!URL_BASE || !KEY) {
  console.error('PUBLIC_SUPABASE_URL ve PUBLIC_SUPABASE_ANON_KEY gerekli.');
  process.exit(1);
}
const FAKE = '00000000-0000-0000-0000-000000000000';
interface Check {
  name: string;
  run: () => Promise<Response>;

  expect: number[];
  why: string;
}
function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: KEY!, Authorization: `Bearer ${KEY}`, ...extra };
}
function get(path: string): Promise<Response> {
  return fetch(`${URL_BASE}${path}`, { headers: headers() });
}
function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${URL_BASE}${path}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
}
const CHECKS: Check[] = [
  {
    name: 'Profiller anonim okunabilir',
    run: () => get('/rest/v1/profiles?select=id&limit=1'),
    expect: [200],
    why: 'Comments and reports must be visible to signed-out visitors.',
  },
  {
    name: 'Raporlar anonim okunabilir',
    run: () => get('/rest/v1/reports?select=id&limit=1'),
    expect: [200],
    why: 'Whoever opens a shared link may not be signed in.',
  },
  {
    name: 'Anonim profil YAZAMAZ',
    run: () => post('/rest/v1/profiles', { id: FAKE, gh_login: 'sahte' }),
    expect: [401, 403],
    why: 'Nobody may create a profile in someone else name.',
  },
  {
    name: 'Anonim rapor YAZAMAZ',
    run: () =>
      post('/rest/v1/reports', {
        owner: 'x',
        repo: 'y',
        kind: 'security-score',
        summary: {},
        created_by: FAKE,
      }),
    expect: [401, 403],
    why: 'Fabricated reports must not be writable.',
  },
  {
    name: 'Anonim yorum YAZAMAZ',
    run: () => post('/rest/v1/comments', { report_id: FAKE, author_id: FAKE, body: 'test' }),
    expect: [401, 403],
    why: 'Commenting requires signing in.',
  },
  {
    name: 'Bildirimler anonim OKUNAMAZ',
    run: () => get('/rest/v1/abuse_reports?select=reason'),
    expect: [401, 403],
    why: 'Exposing who reported whom invites retaliation.',
  },
  {
    name: 'Oylar anonim OKUNAMAZ',
    run: () => get('/rest/v1/votes?select=user_id'),
    expect: [401, 403],
    why: 'Who voted for what must stay private.',
  },
  {
    name: 'auth.users is NOT exposed',
    run: () => get('/rest/v1/users?select=email'),
    expect: [401, 403, 404],
    why: 'User email addresses must never leak, under any condition.',
  },
];
let failed = 0;
for (const check of CHECKS) {
  let status: number;
  try {
    status = (await check.run()).status;
  } catch (err) {
    console.error(`  ERROR  ${check.name} — request failed:`, err);
    failed += 1;
    continue;
  }
  const ok = check.expect.includes(status);
  if (!ok) failed += 1;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'} ${check.name.padEnd(38)} HTTP ${status}` +
      (ok ? '' : `  (beklenen: ${check.expect.join(' veya ')}) — ${check.why}`),
  );
}
console.log('');
if (failed > 0) {
  console.error(`${failed} check(s) failed. The policies are not behaving as expected.`);
  process.exit(1);
}
console.log(`All ${CHECKS.length} checks passed.`);
export {};