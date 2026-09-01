import { GitHubClient } from '../src/lib/github';
import { COMMANDS, getCommand, runCommand, type CommandId, type FieldValues } from '../src/engine';
const [commandId, ...rest] = process.argv.slice(2);
if (!commandId) {
  console.error('Usage: npm run verify -- <command> key=value ...\n');
  console.error('Commands:');
  for (const c of COMMANDS) {
    const keys = c.fields.map((f) => f.key).join(', ');
    console.error(`  ${c.id.padEnd(18)} ${keys}`);
  }
  process.exit(1);
}
const values: FieldValues = {};
for (const arg of rest) {
  const eq = arg.indexOf('=');
  if (eq === -1) continue;
  const key = arg.slice(0, eq);
  const raw = arg.slice(eq + 1);
  if (raw === 'true' || raw === 'false') values[key] = raw === 'true';
  else if (/^\d+$/.test(raw)) values[key] = Number(raw);
  else values[key] = raw;
}
const def = getCommand(commandId as CommandId);
for (const field of def.fields) {
  if (values[field.key] === undefined && field.defaultValue !== undefined) {
    values[field.key] = field.defaultValue;
  }
}
const token = process.env.GITHUB_TOKEN;
const gh = new GitHubClient(token);
console.log(token ? 'Authenticated request' : 'Anonymous request (60 per hour)');
console.log(`Command: ${def.id}  (${def.cli})`);
console.log(`Input: ${JSON.stringify(values)}`);
console.log('');
const started = Date.now();
try {
  const result = await runCommand(gh, def.id, values);
  console.log(JSON.stringify(result.data, null, 2));
  console.log('');
  console.log(`Took ${Date.now() - started} ms`);
  console.log(`Requests left: ${gh.rateLimit.remaining ?? '?'}`);
} catch (err) {
  console.error('ERROR:', err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
}