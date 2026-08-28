import { useEffect, useState } from 'react';
import { COMMANDS, getCommand, type CommandId } from '../../engine';
import {
  loadReport,
  loadTargetReports,
  toCommandResult,
  type StoredReport,
} from '../../lib/reports';
import { ResultView } from '../console/ResultView';
import { Card, Empty, ExternalLink } from '../console/ui';
import { relativeTime } from '../../engine/shared';

interface Target {
  owner: string;
  repo: string;
  kind: CommandId;
}

const VALID_KINDS = new Set(COMMANDS.map((c) => c.id));

/**
 * Hedefi adresten okur.
 *
 * Iki bicim destekleniyor:
 *   /app/r/<sahip>/<depo>/<komut>   ve   /app/u/<kullanici>/<komut>
 *   /app/r/?t=<sahip>/<depo>/<komut>
 *
 * Ikincisi yerel gelistirme icin: statik sunucu yalnizca /app/r/ adresini
 * taniyor. Uretimde Firebase yonlendirmesi derin yollari da bu sayfaya
 * dusuruyor.
 */
function parseTarget(): Target | null {
  if (typeof window === 'undefined') return null;

  const query = new URLSearchParams(window.location.search).get('t');
  const source = query ?? window.location.pathname;

  const parts = source
    .replace(/^\/app\//, '')
    .split('/')
    .filter(Boolean);

  // Sorgu bicimi geldiginde basta r/ ya da u/ olmayabilir.
  const scoped = parts[0] === 'r' || parts[0] === 'u' ? parts.slice(1) : parts;

  if (scoped.length === 3) {
    const [owner, repo, kind] = scoped;
    if (!VALID_KINDS.has(kind as CommandId)) return null;
    return { owner, repo, kind: kind as CommandId };
  }
  if (scoped.length === 2) {
    const [owner, kind] = scoped;
    if (!VALID_KINDS.has(kind as CommandId)) return null;
    return { owner, repo: '', kind: kind as CommandId };
  }
  return null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'bad-url' }
  | { kind: 'missing'; target: Target }
  | { kind: 'ready'; target: Target; report: StoredReport; siblings: StoredReport[] };

export default function ReportPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const target = parseTarget();
    if (!target) {
      setState({ kind: 'bad-url' });
      return;
    }

    void (async () => {
      const [report, siblings] = await Promise.all([
        loadReport(target.owner, target.repo, target.kind),
        loadTargetReports(target.owner, target.repo),
      ]);

      if (!report) {
        setState({ kind: 'missing', target });
        return;
      }
      setState({
        kind: 'ready',
        target,
        report,
        siblings: siblings.filter((s) => s.kind !== target.kind),
      });
    })();
  }, []);

  if (state.kind === 'loading') {
    return <p className="text-sm text-[var(--color-muted)]">Yükleniyor…</p>;
  }

  if (state.kind === 'bad-url') {
    return (
      <Card>
        <div className="px-6 py-8">
          <Empty>
            Bu adres bir rapora işaret etmiyor.{' '}
            <a href="/app/" className="text-sky-400 hover:underline">
              Uygulamaya dön
            </a>
          </Empty>
        </div>
      </Card>
    );
  }

  const label = state.target.repo
    ? `${state.target.owner}/${state.target.repo}`
    : state.target.owner;

  if (state.kind === 'missing') {
    return (
      <div className="space-y-4">
        <Header label={label} kind={state.target.kind} />
        <Card>
          <div className="px-6 py-8">
            <Empty>
              Bu hedef için <strong>{getCommand(state.target.kind).name}</strong> raporu yok — henüz
              kimse çalıştırmamış.{' '}
              <a href="/app/" className="text-sky-400 hover:underline">
                İlk sen çalıştır
              </a>
            </Empty>
          </div>
        </Card>
      </div>
    );
  }

  const { report, siblings, target } = state;
  const scanner = report.profiles?.gh_login;

  return (
    <div className="space-y-6">
      <Header label={label} kind={target.kind} />

      <ResultView result={toCommandResult(report)} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 text-xs text-[var(--color-muted)]">
          <p>
            {scanner ? (
              <>
                Son tarayan{' '}
                <ExternalLink href={`https://github.com/${scanner}`}>{scanner}</ExternalLink>
              </>
            ) : (
              'Son tarayan bilinmiyor'
            )}{' '}
            · {relativeTime(report.updated_at)} · {report.scan_count} kez tarandı
          </p>
          <a href="/app/" className="text-sky-400 hover:underline">
            Yeniden tara
          </a>
        </div>
      </Card>

      {siblings.length > 0 && (
        <Card>
          <div className="px-6 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Bu hedef için diğer raporlar
            </p>
            <ul className="flex flex-wrap gap-2">
              {siblings.map((s) => (
                <li key={s.kind}>
                  <a
                    href={
                      s.repo
                        ? `/app/r/${s.owner}/${s.repo}/${s.kind}`
                        : `/app/u/${s.owner}/${s.kind}`
                    }
                    className="inline-flex rounded-full border border-[var(--color-border)] px-3 py-1 text-xs transition hover:border-[var(--color-border-hover)]"
                  >
                    {getCommand(s.kind).name}
                    {s.score !== null && <span className="ml-2 tabular-nums">{s.score}</span>}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
}

function Header({ label, kind }: { label: string; kind: CommandId }) {
  const command = getCommand(kind);
  return (
    <header>
      <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{command.name}</p>
      <h1 className="mt-1 font-mono text-xl tracking-tight">{label}</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">{command.summary}</p>
    </header>
  );
}
