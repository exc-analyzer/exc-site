import { useState } from 'react';
import { GitHubClient, parseRepo, AuthError, RateLimitError, NotFoundError } from '../lib/github';
import { getGithubToken, forgetGithubToken } from '../lib/githubToken';
import { securityScore, type SecurityScoreResult, type Criterion } from '../engine/securityScore';

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; result: SecurityScoreResult; remaining: number | null }
  | { kind: 'error'; message: string; needsReconnect?: boolean };

export default function RepoScanner() {
  const [input, setInput] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function run() {

    const target = parseRepo(input);
    if (!target) {
      setState({ kind: 'error', message: 'Biçim "sahip/depo" olmalı. Örnek: torvalds/linux' });
      return;
    }

    const token = getGithubToken();
    if (!token) {
      setState({
        kind: 'error',
        message: 'GitHub bağlantısı yok. Taramalar senin kendi API kotanla çalıştığı için giriş gerekiyor.',
        needsReconnect: true,
      });
      return;
    }

    setState({ kind: 'running' });
    const gh = new GitHubClient(token);

    try {
      const result = await securityScore(gh, target.owner, target.repo);
      setState({ kind: 'done', result, remaining: gh.rateLimit.remaining });
    } catch (err) {
      if (err instanceof AuthError) {
        forgetGithubToken();
        setState({
          kind: 'error',
          message: 'GitHub oturumunun süresi dolmuş. Yeniden bağlanman gerekiyor.',
          needsReconnect: true,
        });
      } else if (err instanceof RateLimitError) {
        const at = err.resetAt ? err.resetAt.toLocaleTimeString('tr-TR') : 'birazdan';
        setState({ kind: 'error', message: `GitHub API kotan doldu. ${at} sonrasında tekrar dene.` });
      } else if (err instanceof NotFoundError) {
        setState({
          kind: 'error',
          message: `${target.owner}/${target.repo} bulunamadı. Depo herkese açık mı, adı doğru mu?`,
        });
      } else {
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Beklenmeyen bir hata.' });
      }
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        className="flex flex-col gap-3 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="sahip/depo — örn. torvalds/linux"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-border-hover)]"
        />
        <button
          type="submit"
          disabled={state.kind === 'running'}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-medium transition hover:border-[var(--color-border-hover)] disabled:opacity-50"
        >
          {state.kind === 'running' ? 'Taranıyor…' : 'Güvenlik puanı'}
        </button>
      </form>

      {state.kind === 'error' && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm">
          <p className="text-red-300">{state.message}</p>
          {state.needsReconnect && (
            <p className="mt-2 text-[var(--color-muted)]">
              Yukarıdaki karttan GitHub&apos;a yeniden bağlan.
            </p>
          )}
        </div>
      )}

      {state.kind === 'done' && <ScoreReport result={state.result} remaining={state.remaining} />}
    </div>
  );
}

function ScoreReport({ result, remaining }: { result: SecurityScoreResult; remaining: number | null }) {
  const verdictText =
    result.verdict === 'excellent' ? 'İyi durumda' : result.verdict === 'good' ? 'Fena değil' : 'İyileştirilmeli';
  const verdictColor =
    result.verdict === 'excellent'
      ? 'text-emerald-400'
      : result.verdict === 'good'
        ? 'text-amber-400'
        : 'text-red-400';

  const todo = result.criteria.filter((c) => c.status === 'fail' && c.fix);

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-mono text-base">
          {result.owner}/{result.repo}
        </h2>
        <div className="text-right">
          <div className={`text-3xl font-semibold ${verdictColor}`}>{result.score}<span className="text-base text-[var(--color-muted)]">/100</span></div>
          <div className={`text-sm ${verdictColor}`}>{verdictText}</div>
        </div>
      </div>

      <ul className="mt-6 divide-y divide-[var(--color-border)]">
        {result.criteria.map((c) => (
          <CriterionRow key={c.id} c={c} />
        ))}
      </ul>

      {todo.length > 0 && (
        <div className="mt-6 rounded-lg border border-[var(--color-border)] p-4">
          <h3 className="text-sm font-semibold">Puanı yükseltmek için</h3>
          <ol className="mt-3 space-y-2 text-sm text-[var(--color-muted)]">
            {todo.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span className="text-[var(--color-text)]">→</span>
                <span>{c.fix}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="mt-6 text-xs text-[var(--color-muted)]">
        {result.evaluatedCount} kriter değerlendirildi
        {result.unknownCount > 0 && (
          <>
            , {result.unknownCount} tanesi{' '}
            <strong className="text-[var(--color-text)]">puanlamaya katılmadı</strong>
            {' '}— nedeni her satırın yanında yazıyor
          </>
        )}
        .{remaining !== null && ` Kalan GitHub istek hakkın: ${remaining}.`}
      </p>
    </section>
  );
}

function CriterionRow({ c }: { c: Criterion }) {
  const mark = c.status === 'pass' ? '✓' : c.status === 'fail' ? '✕' : '–';
  const color =
    c.status === 'pass' ? 'text-emerald-400' : c.status === 'fail' ? 'text-red-400' : 'text-[var(--color-muted)]';

  return (
    <li className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <span className="flex items-center gap-3">
        <span className={`w-3 ${color}`}>{mark}</span>
        <span>{c.label}</span>
      </span>
      <span className="text-right text-[var(--color-muted)]">
        {c.detail}
        {c.status === 'fail' && <span className="ml-2 text-red-400">−{c.weight}</span>}
      </span>
    </li>
  );
}
