/**
 * Motoru tarayıcı olmadan, gerçek GitHub API'sine karşı çalıştırır.
 * CLI çıktısıyla yan yana karşılaştırmak ve çökme var mı görmek için.
 *
 * Token verilmezse istekler kimliksiz gider (saatlik 60 istek). Kimliksiz
 * istemci hiçbir deponun yönetici bilgisini okuyamaz; bu da "bilinmiyor"
 * ayrımının doğru çalıştığını görmenin en kolay yolu.
 *
 * Kullanım:
 *   npm run verify -- security-score repo=torvalds/linux
 *   npm run verify -- content-audit repo=exc-analyzer/exc
 *   npm run verify -- user-anomaly username=torvalds
 *   GITHUB_TOKEN=... npm run verify -- analysis repo=exc-analyzer/exc
 */
import { GitHubClient } from '../src/lib/github';
import { COMMANDS, getCommand, runCommand, type CommandId, type FieldValues } from '../src/engine';

const [commandId, ...rest] = process.argv.slice(2);

if (!commandId) {
  console.error('Kullanım: npm run verify -- <komut> anahtar=deger ...\n');
  console.error('Komutlar:');
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

// Tanımlı varsayılanları doldur
const def = getCommand(commandId as CommandId);
for (const field of def.fields) {
  if (values[field.key] === undefined && field.defaultValue !== undefined) {
    values[field.key] = field.defaultValue;
  }
}

const token = process.env.GITHUB_TOKEN;
const gh = new GitHubClient(token);

console.log(token ? 'Kimlikli istek' : 'Kimliksiz istek (saatlik 60)');
console.log(`Komut: ${def.id}  (${def.cli})`);
console.log(`Girdi: ${JSON.stringify(values)}`);
console.log('');

const started = Date.now();
try {
  const result = await runCommand(gh, def.id, values);
  console.log(JSON.stringify(result.data, null, 2));
  console.log('');
  console.log(`Süre: ${Date.now() - started} ms`);
  console.log(`Kalan istek hakkı: ${gh.rateLimit.remaining ?? '?'}`);
} catch (err) {
  console.error('HATA:', err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
}
