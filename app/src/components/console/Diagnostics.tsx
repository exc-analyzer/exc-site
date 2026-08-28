import { useState } from 'react';
import { getGithubToken } from '../../lib/githubToken';

/**
 * Bağlantı testi.
 *
 * Uygulama üç ayrı sunucuya gidiyor ve bunlardan biri engellenirse tarayıcı
 * yalnızca "Failed to fetch" der; hangisi olduğunu söylemez. Bazı ağlar ve
 * bazı ülkelerdeki operatörler bu adreslerin bir kısmını engelliyor.
 * Burada her biri tek tek denenip sonucu ayrı ayrı gösteriliyor.
 */
interface Probe {
  name: string;
  url: string;
  needsToken: boolean;
  /**
   * true ise yalnizca basit basliklarla gonderilir.
   *
   * Authorization ya da X-GitHub-Api-Version gibi bir baslik eklemek tarayiciyi
   * CORS on kontrolu (OPTIONS) yapmaya zorlar. Bazi sunucular - ornegin
   * raw.githubusercontent.com - on kontrolu yanitlamaz ve istek hic
   * gonderilmeden duser. Bu ayrim, "sunucu engelli" ile "istegim yanlis"
   * durumlarini birbirinden ayirmak icin var.
   */
  simple: boolean;
  note: string;
}

const PROBES: Probe[] = [
  {
    name: 'REST API',
    url: 'https://api.github.com/rate_limit',
    needsToken: false,
    simple: false,
    note: 'Komutların çoğu bunu kullanır.',
  },
  {
    name: 'Kod arama (sade istek)',
    url: 'https://api.github.com/search/code?q=repo%3Aexc-analyzer%2Fexc+filename%3AREADME.md&per_page=1',
    needsToken: false,
    simple: true,
    note: 'Ek başlık yok, tarayıcı ön kontrol yapmaz.',
  },
  {
    name: 'Kod arama (tam istek)',
    url: 'https://api.github.com/search/code?q=repo%3Aexc-analyzer%2Fexc+filename%3AREADME.md&per_page=1',
    needsToken: true,
    simple: false,
    note: 'dork-scan bunu kullanır. Ön kontrol gerektirir.',
  },
  {
    name: 'GraphQL',
    url: 'https://api.github.com/graphql',
    needsToken: true,
    simple: false,
    note: 'Depo analizi bunu kullanır.',
  },
  {
    name: 'Dosya içeriği (API)',
    url: 'https://api.github.com/repos/exc-analyzer/exc/contents/README.md',
    needsToken: false,
    simple: false,
    note: 'Sır taramaları artık dosyaları buradan okur.',
  },
  {
    name: 'Ham dosya sunucusu',
    url: 'https://raw.githubusercontent.com/exc-analyzer/exc/HEAD/README.md',
    needsToken: false,
    simple: true,
    note: 'Artık kullanılmıyor; yalnızca karşılaştırma için.',
  },
];

type Outcome =
  | { kind: 'pending' }
  | { kind: 'ok'; status: number; ms: number }
  | { kind: 'http'; status: number; ms: number }
  | { kind: 'blocked'; detail: string }
  | { kind: 'skipped' };

export default function Diagnostics() {
  const [results, setResults] = useState<Record<string, Outcome>>({});
  const [running, setRunning] = useState(false);

  async function runAll() {
    setRunning(true);
    const token = getGithubToken();
    const next: Record<string, Outcome> = {};
    for (const p of PROBES) next[p.name] = { kind: 'pending' };
    setResults({ ...next });

    for (const probe of PROBES) {
      if (probe.needsToken && !token) {
        next[probe.name] = { kind: 'skipped' };
        setResults({ ...next });
        continue;
      }

      const started = performance.now();
      try {
        const res =
          probe.name === 'GraphQL'
            ? await fetch(probe.url, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: '{ viewer { login } }' }),
              })
            : probe.simple
              ? // Basit istek: hicbir ek baslik yok, dolayisiyla on kontrol de yok.
                // Token gonderilemedigi icin 401 donebilir - onemli degil, amac
                // istegin sunucuya ULASIP ulasmadigini gormek.
                await fetch(probe.url)
              : await fetch(probe.url, {
                  headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                  },
                });

        const ms = Math.round(performance.now() - started);
        next[probe.name] = res.ok
          ? { kind: 'ok', status: res.status, ms }
          : { kind: 'http', status: res.status, ms };
      } catch (err) {
        next[probe.name] = {
          kind: 'blocked',
          detail: err instanceof Error ? err.message : String(err),
        };
      }
      setResults({ ...next });
    }

    setRunning(false);
  }

  const anyBlocked = Object.values(results).some((r) => r.kind === 'blocked');

  return (
    <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Bağlantı testi</h3>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Bir komut &quot;ulaşılamadı&quot; hatası veriyorsa hangi sunucunun engellendiğini
            buradan görebilirsin.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runAll()}
          disabled={running}
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-4 py-2 text-sm transition hover:border-[var(--color-line-active)] disabled:opacity-50"
        >
          {running ? 'Deneniyor…' : 'Testi çalıştır'}
        </button>
      </div>

      {Object.keys(results).length > 0 && (
        <ul className="mt-5 divide-y divide-[var(--color-line)]">
          {PROBES.map((probe) => {
            const r = results[probe.name];
            if (!r) return null;
            return (
              <li key={probe.name} className="flex items-start justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm">{probe.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">{probe.note}</p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  {r.kind === 'pending' && <span className="text-[var(--color-muted)]">…</span>}
                  {r.kind === 'ok' && <span className="text-emerald-400">Ulaşıldı · {r.ms} ms</span>}
                  {r.kind === 'http' && (
                    <span className="text-amber-400">
                      Ulaşıldı ama HTTP {r.status}
                      <span className="block text-[var(--color-muted)]">
                        ağ sorunu değil, yetki/kota
                      </span>
                    </span>
                  )}
                  {r.kind === 'blocked' && (
                    <span className="text-red-400">
                      Ulaşılamadı
                      <span className="block text-[var(--color-muted)]">{r.detail}</span>
                    </span>
                  )}
                  {r.kind === 'skipped' && (
                    <span className="text-[var(--color-muted)]">Token gerekiyor</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {anyBlocked && (
        <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/25 px-4 py-3 text-xs text-red-200/90">
          En az bir sunucuya ulaşılamıyor. Sık nedenler: reklam/izleyici engelleyici, tarayıcı
          kalkanı, kurumsal ağ filtresi, operatör engeli veya VPN. Aynı adresi tarayıcıda doğrudan
          açmayı dene — o da açılmıyorsa engel tarayıcının dışında.
        </p>
      )}
    </section>
  );
}
