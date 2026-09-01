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
import { reportPath, reportTarget, saveReport } from '../../lib/reports';
import { SITE_URL } from '../../lib/site';

type RunState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | {
      kind: 'done';
      result: CommandResult;
      remaining: number | null;
      limit: number | null;
      ms: number;
      permalink: string | null;
      saving: boolean;
    }
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
    const sync = () => setHasToken(Boolean(getGithubToken()));
    sync();
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get('cmd');
    const repo = params.get('repo');
    const user = params.get('user');
    if (!wanted && !repo && !user) return;

    const target = COMMANDS.find((c) => c.id === wanted) ?? null;
    const id = target?.id ?? (user ? 'user-analysis' : 'security-score');
    const def = getCommand(id);
    const next = defaultsFor(def.fields);
    if (repo && def.fields.some((f) => f.key === 'repo')) next.repo = repo;
    if (user && def.fields.some((f) => f.key === 'username')) next.username = user;
    setActiveId(id);
    setValues(next);
  }, []);

  const locked = Boolean(command.requiresAuth) && !hasToken;

  function select(id: CommandId) {
    setActiveId(id);
    setValues(defaultsFor(getCommand(id).fields));
    setState({ kind: 'idle' });
  }

  async function run() {
    const token = getGithubToken();
    if (command.requiresAuth && !token) {
      setState({
        kind: 'error',
        message: command.authReason ?? 'This command needs a signed-in GitHub session.',
        needsReconnect: true,
      });
      return;
    }

    setState({ kind: 'running' });
    const gh = new GitHubClient(token ?? undefined);
    const started = performance.now();

    try {
      const result = await runCommand(gh, activeId, values);
      const canSave = Boolean(token) && !command.sensitive;

      setState({
        kind: 'done',
        result,
        remaining: gh.rateLimit.remaining,
        limit: gh.rateLimit.limit,
        ms: Math.round(performance.now() - started),
        permalink: null,
        saving: canSave,
      });

      if (!canSave) return;

      void saveReport(result).then((saved) => {
        const target = reportTarget(result);
        const link = saved && target ? reportPath(target.owner, target.repo, result.id) : null;
        setState((prev) =>
          prev.kind === 'done' && prev.result === result
            ? { ...prev, permalink: link, saving: false }
            : prev,
        );
      });
    } catch (err) {
      if (err instanceof AuthError) {
        forgetGithubToken();
        setHasToken(false);
        setState({
          kind: 'error',
          message: 'Your GitHub session expired. Connect again to keep the higher limit.',
          needsReconnect: true,
        });
      } else if (err instanceof RateLimitError) {
        const at = err.resetAt ? err.resetAt.toLocaleTimeString('en-GB') : 'shortly';
        setState({
          kind: 'error',
          message: token
            ? `You have used up your GitHub API quota. It resets at ${at}.`
            : `Guest scanning is capped at 60 requests an hour and yours are gone until ${at}. Signing in with GitHub raises that to 5,000.`,
          needsReconnect: !token,
        });
      } else if (err instanceof NetworkError) {
        setState({
          kind: 'error',
          message: `${err.message} — the request never left the browser. Usually that is an ad or tracker blocker, or a browser shield. On Brave, open the shield icon in the address bar and turn Shields off for this site, then try again.`,
        });
      } else if (err instanceof NotFoundError) {
        setState({ kind: 'error', message: err.message || 'Could not find what you asked for.' });
      } else {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Something unexpected went wrong.',
        });
      }
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <Sidebar activeId={activeId} onSelect={select} hasToken={hasToken} />

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
            Sensitive command. The result is never saved, has no shareable address, and never
            reaches the community feed. Anything found is shown masked.
          </p>
        )}

        {locked && (
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-xs">
            <p className="text-[var(--color-text)]">This one needs a GitHub session</p>
            <p className="mt-1 text-[var(--color-muted)]">
              {command.authReason} Every other command runs without an account.
            </p>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
          className="space-y-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
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
              disabled={state.kind === 'running' || locked}
              className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-5 py-2 text-sm font-medium transition hover:border-[var(--color-line-active)] disabled:opacity-50"
            >
              {state.kind === 'running' ? 'Running…' : 'Run'}
            </button>

            {state.kind === 'done' && (
              <p className="text-xs text-[var(--color-muted)]">
                {state.ms} ms
                {state.remaining !== null &&
                  ` · ${state.remaining}${state.limit ? `/${state.limit}` : ''} requests left`}
              </p>
            )}
            {state.kind !== 'done' && !hasToken && !locked && (
              <p className="text-xs text-[var(--color-muted)]">
                Running as a guest: 60 requests an hour.
              </p>
            )}
          </div>
        </form>

        {state.kind === 'error' && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/25 p-4 text-sm">
            <p className="text-red-300">{state.message}</p>
            {state.needsReconnect && (
              <p className="mt-2 text-[var(--color-muted)]">
                Connect from the card at the top of the page.
              </p>
            )}
          </div>
        )}

        {state.kind === 'running' && (
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-8 text-center text-sm text-[var(--color-muted)]">
            Scanning in your browser…
          </div>
        )}

        {state.kind === 'done' && state.saving && (
          <p className="text-xs text-[var(--color-muted)]">Saving this report…</p>
        )}

        {state.kind === 'done' && state.permalink && <Permalink href={state.permalink} />}

        {state.kind === 'done' && !hasToken && !command.sensitive && <SignInNudge />}

        {state.kind === 'done' && <ResultView result={state.result} />}
      </div>
    </div>
  );
}

function SignInNudge() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm">This result lives only in this tab</p>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Sign in to keep it at a permanent address, get a README badge, and let others comment on
          it.
        </p>
      </div>
      <a href="/app/" className="btn btn-ghost shrink-0">
        Sign in
      </a>
    </div>
  );
}

function Permalink({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);
  const full = `${SITE_URL}${href}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-3">
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-muted)]">Permanent address for this report</p>
        <a href={href} className="block truncate font-mono text-xs text-sky-400 hover:underline">
          {full}
        </a>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(full).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
        className="shrink-0 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs transition hover:border-[var(--color-line-active)]"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Sidebar({
  activeId,
  onSelect,
  hasToken,
}: {
  activeId: CommandId;
  onSelect: (id: CommandId) => void;
  hasToken: boolean;
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
                const needsAuth = Boolean(c.requiresAuth) && !hasToken;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition ${
                        active
                          ? 'bg-[var(--color-surface)] text-[var(--color-text)]'
                          : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
                      }`}
                    >
                      <span className="min-w-0 truncate">{c.name}</span>
                      {needsAuth && (
                        <span
                          title="Needs a GitHub session"
                          className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--color-faint)]"
                        >
                          sign in
                        </span>
                      )}
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
    'w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-line-active)]';

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
