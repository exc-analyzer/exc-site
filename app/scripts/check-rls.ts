/**
 * RLS politikalarının gerçekten tuttuğunu doğrular.
 *
 * Şema dosyaları herkese açık bir depoda duruyor. Bu bir zafiyet değil —
 * güvenlik kuralını Postgres sunucu tarafında uyguluyor, kuralı bilmek onu
 * aşmaya yaramıyor. Ama saldırganın neyi deneyeceğini tam bilmesi, bizim
 * hata payımızı daraltıyor: politikalarda bir yanlışlık olursa çabuk bulunur.
 *
 * Bu yüzden doğrulama "hatırladığımda" değil, her gece çalışıyor.
 *
 * Yalnızca anonim anahtarla, dışarıdan bakan biri gibi deniyor.
 */
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
  /** Kabul edilebilir durum kodları. */
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
    why: 'Yorumlarda ve raporlarda giriş yapmamış ziyaretçiye de görünmeli.',
  },
  {
    name: 'Raporlar anonim okunabilir',
    run: () => get('/rest/v1/reports?select=id&limit=1'),
    expect: [200],
    why: 'Paylaşılan bağlantıyı açan kişi giriş yapmış olmayabilir.',
  },
  {
    name: 'Anonim profil YAZAMAZ',
    run: () => post('/rest/v1/profiles', { id: FAKE, gh_login: 'sahte' }),
    expect: [401, 403],
    why: 'Kimse başkası adına profil oluşturamamalı.',
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
    why: 'Uydurma rapor yazılamamalı.',
  },
  {
    name: 'Anonim yorum YAZAMAZ',
    run: () => post('/rest/v1/comments', { report_id: FAKE, author_id: FAKE, body: 'test' }),
    expect: [401, 403],
    why: 'Yorum yazmak giriş gerektirir.',
  },
  {
    name: 'Bildirimler anonim OKUNAMAZ',
    run: () => get('/rest/v1/abuse_reports?select=reason'),
    expect: [401, 403],
    why: 'Kimin kimi bildirdiği görünürse misilleme olur.',
  },
  {
    name: 'Oylar anonim OKUNAMAZ',
    run: () => get('/rest/v1/votes?select=user_id'),
    expect: [401, 403],
    why: 'Kimin ne oyladığı gizli kalmalı.',
  },
  {
    name: 'auth.users dışarı açık DEĞİL',
    run: () => get('/rest/v1/users?select=email'),
    expect: [401, 403, 404],
    why: 'Kullanıcı e-postaları hiçbir koşulda dışarı sızmamalı.',
  },
];

let failed = 0;

for (const check of CHECKS) {
  let status: number;
  try {
    status = (await check.run()).status;
  } catch (err) {
    console.error(`  HATA   ${check.name} — istek gönderilemedi:`, err);
    failed += 1;
    continue;
  }

  const ok = check.expect.includes(status);
  if (!ok) failed += 1;
  console.log(
    `  ${ok ? 'OK  ' : 'BAŞARISIZ'} ${check.name.padEnd(38)} HTTP ${status}` +
      (ok ? '' : `  (beklenen: ${check.expect.join(' veya ')}) — ${check.why}`),
  );
}

console.log('');
if (failed > 0) {
  console.error(`${failed} kontrol başarısız. Politikalar beklendiği gibi davranmıyor.`);
  process.exit(1);
}
console.log(`${CHECKS.length} kontrolün hepsi geçti.`);

export {};
