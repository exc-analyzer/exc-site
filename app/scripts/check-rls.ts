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
  empty?: boolean;
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
    name: 'Report cards readable anonymously',
    run: () => get('/rest/v1/report_card?select=id&limit=1'),
    expect: [200],
    why: 'Whoever opens a shared link may not be signed in.',
  },
  {
    name: 'Scanner identity NOT readable anonymously',
    run: () => get('/rest/v1/reports?select=created_by&limit=1'),
    expect: [401, 403],
    why: 'It resolves to a login the report card deliberately blanks.',
  },
  {
    name: 'Taken-down scans return nothing',
    run: () => get('/rest/v1/reports?select=id&hidden_at=not.is.null'),
    expect: [200],
    empty: true,
    why: 'Row level security must hide what a moderator removed, not only the view.',
  },
  {
    name: 'Private account state NOT readable anonymously',
    run: () => get('/rest/v1/profiles?select=notifications_seen_at&limit=1'),
    expect: [401, 403],
    why: 'When somebody last looked at their notifications is nobody else business.',
  },
  {
    name: 'Own-profile RPC NOT callable anonymously',
    run: () => post('/rest/v1/rpc/my_profile', {}),
    expect: [401, 403, 404],
    why: 'It returns the caller full row, so it must require a session.',
  },
  {
    name: 'Score history NOT readable anonymously',
    run: () => get('/rest/v1/report_scores?select=score&limit=1'),
    expect: [401, 403],
    why: 'Nothing reads it any more, so nothing should be able to.',
  },
  {
    name: 'Deleted posts return nothing',
    run: () => get('/rest/v1/posts?select=id&deleted_at=not.is.null'),
    expect: [200],
    empty: true,
    why: 'A post its author deleted must not come back through the table.',
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
    name: 'Private messages NOT readable anonymously',
    run: () => get('/rest/v1/messages?select=body&limit=1'),
    expect: [401, 403],
    why: 'A message between two people is theirs alone.',
  },
  {
    name: 'Conversation list NOT callable anonymously',
    run: () => post('/rest/v1/rpc/my_conversations', {}),
    expect: [401, 403, 404],
    why: 'It returns whoever the caller has been talking to.',
  },
  {
    name: 'Message pings NOT readable anonymously',
    run: () => get('/rest/v1/mail_pings?select=key&limit=1'),
    expect: [401, 403],
    why: 'Even knowing that somebody got mail is theirs to know.',
  },
  {
    name: 'Chat channel key NOT callable anonymously',
    run: () => post('/rest/v1/rpc/chat_key', { other: FAKE }),
    expect: [401, 403, 404],
    why: 'It is the shared secret that names a private typing channel.',
  },
  {
    name: 'Chat keys table NOT readable anonymously',
    run: () => get('/rest/v1/chat_keys?select=key&limit=1'),
    expect: [401, 403],
    why: 'Reading it would hand out every pair channel at once.',
  },
  {
    name: 'Ping routing key NOT callable anonymously',
    run: () => post('/rest/v1/rpc/my_mail_key', {}),
    expect: [401, 403, 404],
    why: 'The key is what makes a live channel unguessable.',
  },
  {
    name: 'Ping rows name nobody',
    run: () => get('/rest/v1/mail_pings?select=user_id&limit=1'),
    expect: [400, 401, 403],
    why: 'A column naming the recipient would let anyone watch one person traffic.',
  },
  {
    name: 'Unread count NOT callable anonymously',
    run: () => post('/rest/v1/rpc/unread_mail', {}),
    expect: [401, 403, 404],
    why: 'It counts the caller own unread messages, so it needs a session.',
  },
  {
    name: 'Mutual-follow probe NOT callable anonymously',
    run: () => post('/rest/v1/rpc/follow_is_mutual', { one: FAKE, two: FAKE }),
    expect: [401, 403, 404],
    why: 'It would answer questions about who follows whom behind a private account.',
  },
  {
    name: 'Message reporting NOT callable anonymously',
    run: () => post('/rest/v1/rpc/report_message', { message: FAKE, why: 'test' }),
    expect: [401, 403, 404],
    why: 'Reporting marks a private message for moderator eyes, so it needs a session.',
  },
  {
    name: 'Marking a conversation read NOT callable anonymously',
    run: () => post('/rest/v1/rpc/mark_conversation_read', { other: FAKE }),
    expect: [401, 403, 404],
    why: 'It writes to messages, which only the recipient may do.',
  },
  {
    name: 'Blocks NOT readable anonymously',
    run: () => get('/rest/v1/blocks?select=blocked_id&limit=1'),
    expect: [401, 403],
    why: 'Who blocked whom is nobody else business, least of all the blocked person.',
  },
  {
    name: 'Blocking NOT callable anonymously',
    run: () => post('/rest/v1/rpc/block_person', { other: FAKE }),
    expect: [401, 403, 404],
    why: 'A block must come from the person making it.',
  },
  {
    name: 'Block list NOT callable anonymously',
    run: () => post('/rest/v1/rpc/my_blocks', {}),
    expect: [401, 403, 404],
    why: 'It answers only about the caller, so it needs a session.',
  },
  {
    name: 'Conversation clears NOT readable anonymously',
    run: () => get('/rest/v1/conversation_clears?select=user_id&limit=1'),
    expect: [401, 403],
    why: 'Whether somebody cleared a conversation is private to them.',
  },
  {
    name: 'Clearing a conversation NOT callable anonymously',
    run: () => post('/rest/v1/rpc/clear_conversation', { other: FAKE }),
    expect: [401, 403, 404],
    why: 'It writes on the caller behalf.',
  },
  {
    name: 'Message reactions NOT readable anonymously',
    run: () => get('/rest/v1/message_reactions?select=emoji&limit=1'),
    expect: [401, 403],
    why: 'A reaction belongs to a private conversation.',
  },
  {
    name: 'Anonymous reaction write BLOCKED',
    run: () =>
      post('/rest/v1/message_reactions', {
        message_id: FAKE,
        user_id: FAKE,
        emoji: 'x',
      }),
    expect: [401, 403],
    why: 'Nobody may react in someone else name.',
  },
  {
    name: 'Mutual people list NOT callable anonymously',
    run: () => post('/rest/v1/rpc/mutual_people', {}),
    expect: [401, 403, 404],
    why: 'It lists who follows the caller back.',
  },
  {
    name: 'Follow news NOT readable anonymously',
    run: () => get('/rest/v1/follow_news?select=kind&limit=1'),
    expect: [401, 403],
    why: 'Who accepted whom is only the two of them business.',
  },
  {
    name: 'Clearing follow news NOT callable anonymously',
    run: () => post('/rest/v1/rpc/mark_follow_news_seen', {}),
    expect: [401, 403, 404],
    why: 'It writes on the caller behalf.',
  },
  {
    name: 'Follow news RPC NOT callable anonymously',
    run: () => post('/rest/v1/rpc/my_follow_news', {}),
    expect: [401, 403, 404],
    why: 'It answers only about the caller.',
  },
  {
    name: 'Follow date NOT callable anonymously',
    run: () => post('/rest/v1/rpc/friends_since', { other: FAKE }),
    expect: [401, 403, 404],
    why: 'When two people started following each other is between them.',
  },
  {
    name: 'Chat themes NOT readable anonymously',
    run: () => get('/rest/v1/chat_themes?select=theme&limit=1'),
    expect: [401, 403],
    why: 'What somebody chose for a private chat is theirs.',
  },
  {
    name: 'Setting a chat theme NOT callable anonymously',
    run: () => post('/rest/v1/rpc/set_chat_theme', { other: FAKE, choice: 'love' }),
    expect: [401, 403, 404],
    why: 'It writes a row on the caller behalf.',
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
  let rows: unknown = null;
  try {
    const res = await check.run();
    status = res.status;
    if (check.empty) rows = await res.json().catch(() => null);
  } catch (err) {
    console.error(`  ERROR  ${check.name} — request failed:`, err);
    failed += 1;
    continue;
  }
  const emptyOk =
    !check.empty || (Array.isArray(rows) && (rows as unknown[]).length === 0);
  const ok = check.expect.includes(status) && emptyOk;
  if (!ok) failed += 1;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'} ${check.name.padEnd(38)} HTTP ${status}` +
      (ok
        ? ''
        : `  (expected: ${check.expect.join(' or ')}${
            check.empty ? ' and no rows' : ''
          }) — ${check.why}`),
  );
}
console.log('');
if (failed > 0) {
  console.error(`${failed} check(s) failed. The policies are not behaving as expected.`);
  process.exit(1);
}
console.log(`All ${CHECKS.length} checks passed.`);
export {};