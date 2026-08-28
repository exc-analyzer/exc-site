/**
 * Motoru gercek GitHub API'sine karsi calistirir ve sonucu yazdirir.
 *
 * Amac: tarayici olmadan, CLI ciktisiyla yan yana karsilastirabilmek.
 * Token verilmezse istekler kimliksiz gider (saatlik 60 istek) - bu da
 * duzeltmenin dogru calistigini gostermek icin ise yarar, cunku kimliksiz
 * istemci hicbir deponun yonetici bilgisini okuyamaz.
 *
 * Kullanim:
 *   npm run verify -- exc-analyzer/exc torvalds/linux
 *   GITHUB_TOKEN=... npm run verify -- exc-analyzer/exc
 */
import { GitHubClient, parseRepo } from '../src/lib/github';
import { securityScore } from '../src/engine/securityScore';

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Kullanim: npm run verify -- sahip/depo [sahip/depo ...]');
  process.exit(1);
}

const token = process.env.GITHUB_TOKEN;
const gh = new GitHubClient(token);
console.log(token ? 'Kimlikli istek' : 'Kimliksiz istek (saatlik 60)');

for (const raw of targets) {
  const t = parseRepo(raw);
  if (!t) {
    console.error(`\nGecersiz: ${raw}`);
    continue;
  }

  try {
    const r = await securityScore(gh, t.owner, t.repo);
    console.log(`\n=== ${r.owner}/${r.repo} ===`);
    console.log(`Puan: ${r.score}/100  (${r.verdict})`);
    console.log(`Degerlendirilen: ${r.evaluatedCount}, bilinmeyen: ${r.unknownCount}`);
    for (const c of r.criteria) {
      const mark = c.status === 'pass' ? 'OK  ' : c.status === 'fail' ? 'FAIL' : '??  ';
      const cost = c.status === 'fail' ? ` (-${c.weight})` : '';
      console.log(`  ${mark} ${c.label.padEnd(34)} ${c.detail}${cost}`);
    }
    console.log(`Kalan istek hakki: ${gh.rateLimit.remaining ?? '?'}`);
  } catch (err) {
    console.error(`\n=== ${t.owner}/${t.repo} === HATA:`, err instanceof Error ? err.message : err);
  }
}
