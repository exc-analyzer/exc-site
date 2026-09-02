const URL_BASE = process.env.PUBLIC_SUPABASE_URL;
const KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;
if (!URL_BASE || !KEY) {
  console.error('PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY are required.');
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
    name: 'Profiles readable anonymously',
    run: () => get('/rest/v1/profiles?select=id&limit=1'),
    expect: [200],
    why: 'Comments and reports must be visible to signed-out visitors.',
  },
  {
    name: 'Reports readable anonymously',
    run: () => get('/rest/v1/reports?select=id&limit=1'),
    expect: [200],
    why: 'Whoever opens a shared link may not be signed in.',
  },
  {
    name: 'Anonymous profile write BLOCKED',
    run: () => post('/rest/v1/profiles', { id: FAKE, gh_login: 'fake' }),
    expect: [401, 403],
    why: 'Nobody may create a profile in someone else name.',
  },
  {
    name: 'Anonymous report write BLOCKED',
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
    name: 'Anonymous comment write BLOCKED',
    run: () => post('/rest/v1/comments', { report_id: FAKE, author_id: FAKE, body: 'test' }),
    expect: [401, 403],
    why: 'Commenting requires signing in.',
  },
  {
    name: 'Abuse reports NOT readable anonymously',
    run: () => get('/rest/v1/abuse_reports?select=reason'),
    expect: [401, 403],
    why: 'Exposing who reported whom invites retaliation.',
  },
  {
    name: 'Votes NOT readable anonymously',
    run: () => get('/rest/v1/votes?select=user_id'),
    expect: [401, 403],
    why: 'Who voted for what must stay private.',
  },
  {
    name: 'Follows NOT readable anonymously',
    run: () => get('/rest/v1/follows?select=user_id'),
    expect: [401, 403],
    why: 'What someone watches is their business alone.',
  },
  {
    name: 'Follow activity NOT readable anonymously',
    run: () => get('/rest/v1/follow_activity?select=owner'),
    expect: [401, 403],
    why: 'The view must answer with the caller rights, not the creator rights.',
  },
  {
    name: 'Feed readable anonymously',
    run: () => get('/rest/v1/feed?select=kind&limit=1'),
    expect: [200],
    why: 'A visitor who has not signed in still gets to read the place.',
  },
  {
    name: 'Anonymous post write BLOCKED',
    run: () => post('/rest/v1/posts', { body: 'x', author_id: FAKE }),
    expect: [401, 403],
    why: 'Nobody may write in someone else name.',
  },
  {
    name: 'Bookmarks NOT readable anonymously',
    run: () => get('/rest/v1/bookmarks?select=user_id'),
    expect: [401, 403],
    why: 'What a person keeps is theirs alone.',
  },
  {
    name: 'Replies view NOT readable anonymously',
    run: () => get('/rest/v1/my_replies?select=id'),
    expect: [401, 403],
    why: 'Notifications belong to whoever they are addressed to.',
  },
  {
    name: 'Anonymous cannot follow a person',
    run: () => post('/rest/v1/people_follows', { follower_id: FAKE, followee_id: FAKE }),
    expect: [401, 403],
    why: 'A follow must come from the person doing it.',
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