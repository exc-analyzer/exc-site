import { commitAnomaly } from '../src/engine/commitAnomaly';

const SHOULD_FLAG = [
  'fix: remove security check to unblock deploy',
  'disable auth for the demo',
  'hardcode the api key for now',
  'add password to config',
  'temp fix for the login bug',
  'quick hack around the rate limiter',
  'TODO: come back to this',
  'oops, forgot the migration',
  'bump deps [skip ci]',
  'remove leftover debug logging',
  'update',
  '.',
  'wip',
  'asdf',
  'fix',
];

const SHOULD_PASS = [
  'style: aciklama satirlarini kaldir',
  'test: yardim testini dil ayarindan bagimsiz hale getir',
  'ci: sir yonetimini sikilastir (Trusted Publishing)',
  'feat: add secret scanning to the nightly job',
  'docs: explain how passwords are stored',
  'fix: handle the latest api version',
  'chore: update the issue template',
  'refactor: extract the debug helper',
  'test: cover the token refresh path',
  'feat: add token rotation support',
  'fix(auth): keep the session alive across a reload',
  'perf: cache the contributor stats response',
];

const messages = [...SHOULD_FLAG, ...SHOULD_PASS];

const stub = {
  get: async () =>
    messages.map((message, i) => ({
      sha: String(i).padStart(7, '0'),
      html_url: '',
      commit: { message, author: { name: 'x', date: '2026-01-01T00:00:00Z' } },
    })),
} as never;

const result = await commitAnomaly(stub, 'owner', 'repo', messages.length);
const flagged = new Set(result.risky.map((r) => r.message));

let failures = 0;
for (const message of SHOULD_FLAG) {
  if (!flagged.has(message)) {
    failures += 1;
    console.error(`  MISSED   ${message}`);
  }
}
for (const message of SHOULD_PASS) {
  if (flagged.has(message)) {
    failures += 1;
    console.error(`  FALSE    ${message}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${messages.length} commit rules behaved wrongly.`);
  process.exit(1);
}
console.log(`All ${messages.length} commit message rules behaved as expected.`);
