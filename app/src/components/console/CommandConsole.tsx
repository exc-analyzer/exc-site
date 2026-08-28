import { useEffect, useMemo, useState } from 'react';
import {
  COMMANDS,
  CATEGORIES,
  getCommand,
  runCommand,
  type CommandCategory,
  type CommandId,
  type CommandResult,
  type FieldSpec,
  type FieldValues,
} from '../../engine';
import { AuthError, GitHubClient, NetworkError, NotFoundError, RateLimitError } from '../../lib/github';
import { forgetGithubToken, getGithubToken } from '../../lib/githubToken';
import { ResultView } from './ResultView';

type RunState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; result: CommandResult; remaining: number | null; ms: number }
  | { kind: 'error'; message: string; needsReconnect?: boolean };

function defaultsFor(fields: FieldSpec[]): FieldValues {
  const out: FieldValues = {};
  for (const f of fields) {
    if (f.defaultValue !== undefined) out[f.key] = f.defaultValue;
    else if (f.kind === 'checkbox') out[f.key] = false;
    else out[f.key] = '';
  }
  return out;
}

export default function CommandConsole() {
  const [activeId, setActiveId] = useState<CommandId>('security-score');
  const command = useMemo(() => getCommand(activeId), [activeId]);
  const [values, setValues] = useState<FieldValues>(() => defaultsFor(command.fields));
  const [state, setState] = useState<RunState>({ kind: 'idle' });
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    setHasToken(Boolean(getGithubToken()));
  }, []);

  function select(id: CommandId) {
    setActiveId(id);
    setValues(defaultsFor(getCommand(id).fields));
    setState({ kind: 'idle' });
  }

  async function run() {
    const token = getGithubToken();
    if (!token) {
      setState({
        kind: 'error',
        message:
          'GitHub bağlantısı yok. Taramalar senin kendi API kotanla çalıştığı için giriş gerekiyor.',
        needsReconnect: true,
      });
      return;
    }

    setState({ kind: 'running' });
    const gh = new GitHubClient(token);
    const started = performance.now();

    try {
      const result = await runCommand(gh, activeId, values);
      setState({
        kind: 'done',
        result,
        remaining: gh.rateLimit.remaining,
        ms: Math.round(performance.now() - started),
      });
    } catch (err) {
      if (err instanceof AuthError) {
        forgetGithubToken();
        setHasToken(false);
        setState({
          kind: 'error',
          message: 'GitHub oturumunun süresi dolmuş. Yeniden bağlanman gerekiyor.',
          needsReconnect: true,
        });
      } else if (err instanceof RateLimitError) {
        const at = err.resetAt ? err.resetAt.toLocaleTimeString('tr-TR') : 'birazdan';
        setState({ kind: 'error', message: `GitHub API kotan doldu. ${at} sonrasında tekrar dene.` });
      } else if (err instanceof NetworkError) {
        setState({
          kind: 'error',
          message: `${err.message} — istek tarayıcıdan çıkamadı. En sık nedeni bir reklam/izleyici engelleyici ya da tarayıcı kalkanı. Brave kullanıyorsan adres çubuğundaki kalkan simgesinden bu site için Shields'ı kapatıp tekrar dene.`,
        });
      } else if (err instanceof NotFoundError) {
        setState({ kind: 'error', message: err.message || 'Aradığın şey bulunamadı.' });
      } else {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.',
        });
      }
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <Sidebar activeId={activeId} onSelect={select} />

      <div className="min-w-0 space-y-6">
        <header>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold tracking-tight">{command.name}</h2>
            <code className="text-xs text-[var(--color-muted)]">{command.cli}</code>
          </div>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{command.summary}</p>
        </header>

        {command.sensitive && (
          <p className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-xs text-amber-200/90">
            Hassas komut. Sonucu kaydedilmez, paylaşılabilir adresi olmaz, topluluk akışına düşmez.
            Bulunan değerler yalnızca maskeli gösterilir.
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
          className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {command.fields.map((field) => (
              <Field
                key={field.key}
                field={field}
                value={values[field.key]}
                onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="submit"
              disabled={state.kind === 'running'}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-5 py-2 text-sm font-medium transition hover:border-[var(--color-border-hover)] disabled:opacity-50"
            >
              {state.kind === 'running' ? 'Çalışıyor…' : 'Çalıştır'}
            </button>

            {state.kind === 'done' && (
              <p className="text-xs text-[var(--color-muted)]">
                {state.ms} ms
                {state.remaining !== null && ` · kalan istek hakkın: ${state.remaining}`}
              </p>
            )}
            {!hasToken && state.kind === 'idle' && (
              <p className="text-xs text-[var(--color-muted)]">
                Çalıştırmak için yukarıdan GitHub&apos;a bağlan.
              </p>
            )}
          </div>
        </form>

        {state.kind === 'error' && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/25 p-4 text-sm">
            <p className="text-red-300">{state.message}</p>
            {state.needsReconnect && (
              <p className="mt-2 text-[var(--color-muted)]">
                Sayfanın üstündeki karttan GitHub&apos;a yeniden bağlan.
              </p>
            )}
          </div>
        )}

        {state.kind === 'running' && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-8 text-center text-sm text-[var(--color-muted)]">
            Tarama senin tarayıcında çalışıyor…
          </div>
        )}

        {state.kind === 'done' && <ResultView result={state.result} />}
      </div>
    </div>
  );
}

function Sidebar({
  activeId,
  onSelect,
}: {
  activeId: CommandId;
  onSelect: (id: CommandId) => void;
}) {
  return (
    <nav className="lg:sticky lg:top-6 lg:self-start">
      <ul className="space-y-6">
        {CATEGORIES.map((category) => (
          <li key={category.id}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              {category.label}
            </p>
            <ul className="space-y-0.5">
              {COMMANDS.filter((c) => c.category === (category.id as CommandCategory)).map((c) => {
                const active = c.id === activeId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      className={`w-full rounded-lg px-3 py-1.5 text-left text-sm transition ${
                        active
                          ? 'bg-[var(--color-surface)] text-[var(--color-text)]'
                          : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
                      }`}
                    >
                      {c.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  const inputClass =
    'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-border-hover)]';

  if (field.kind === 'checkbox') {
    return (
      <label className="flex items-start gap-3 sm:col-span-2">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--color-primary)]"
        />
        <span>
          <span className="text-sm">{field.label}</span>
          {field.hint && (
            <span className="block text-xs text-[var(--color-muted)]">{field.hint}</span>
          )}
        </span>
      </label>
    );
  }

  return (
    <label className={field.kind === 'number' ? '' : 'sm:col-span-2'}>
      <span className="mb-1.5 block text-xs text-[var(--color-muted)]">{field.label}</span>

      {field.kind === 'select' ? (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.kind === 'number' ? 'number' : 'text'}
          value={String(value ?? '')}
          min={field.min}
          max={field.max}
          onChange={(e) =>
            onChange(field.kind === 'number' ? Number(e.target.value) : e.target.value)
          }
          placeholder={field.placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className={inputClass}
        />
      )}

      {field.hint && (
        <span className="mt-1 block text-xs text-[var(--color-muted)]">{field.hint}</span>
      )}
    </label>
  );
}
