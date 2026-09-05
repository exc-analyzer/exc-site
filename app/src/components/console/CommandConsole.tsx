import { useEffect, useMemo, useState } from "react";
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
} from "../../engine";
import {
  AuthError,
  GitHubClient,
  NetworkError,
  NotFoundError,
  RateLimitError,
} from "../../lib/github";
import { forgetGithubToken, getGithubToken } from "../../lib/githubToken";
import { ResultView } from "./ResultView";
import { reportPath, reportTarget, saveReport } from "../../lib/reports";
import { SITE_URL } from "../../lib/site";
import Icon from "../Icon";

type RunState =
  | { kind: "idle" }
  | { kind: "running" }
  | {
      kind: "done";
      result: CommandResult;
      remaining: number | null;
      limit: number | null;
      ms: number;
      permalink: string | null;
      saving: boolean;
      published?: boolean;
      saveOutcome?: "saved" | "skipped" | "no-access" | "failed";
    }
  | { kind: "error"; message: string; needsReconnect?: boolean };

function defaultsFor(fields: FieldSpec[]): FieldValues {
  const out: FieldValues = {};
  for (const f of fields) {
    if (f.defaultValue !== undefined) out[f.key] = f.defaultValue;
    else if (f.kind === "checkbox") out[f.key] = false;
    else out[f.key] = "";
  }
  return out;
}

export default function CommandConsole() {
  const [activeId, setActiveId] = useState<CommandId>("security-score");
  const command = useMemo(() => getCommand(activeId), [activeId]);
  const [values, setValues] = useState<FieldValues>(() =>
    defaultsFor(command.fields),
  );
  const [state, setState] = useState<RunState>({ kind: "idle" });
  const [quota, setQuota] = useState<{
    remaining: number | null;
    limit: number | null;
  }>({ remaining: null, limit: null });
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    const sync = () => setHasToken(Boolean(getGithubToken()));
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("cmd");
    const repo = params.get("repo");
    const user = params.get("user");
    if (!wanted && !repo && !user) return;

    const target = COMMANDS.find((c) => c.id === wanted) ?? null;
    const id = target?.id ?? (user ? "user-analysis" : "security-score");
    const def = getCommand(id);
    const next = defaultsFor(def.fields);
    if (repo && def.fields.some((f) => f.key === "repo")) next.repo = repo;
    if (user && def.fields.some((f) => f.key === "username"))
      next.username = user;
    setActiveId(id);
    setValues(next);
  }, []);

  const locked = Boolean(command.requiresAuth) && !hasToken;

  function select(id: CommandId) {
    setActiveId(id);
    setValues(defaultsFor(getCommand(id).fields));
    setState({ kind: "idle" });
  }

  async function run() {
    const token = getGithubToken();
    if (command.requiresAuth && !token) {
      setState({
        kind: "error",
        message:
          command.authReason ??
          "This command needs a signed-in GitHub session.",
        needsReconnect: true,
      });
      return;
    }

    if (command.id === "advanced-secrets" && quota.remaining !== null && quota.limit) {
      const share = quota.remaining / quota.limit;
      if (share < 0.2) {
        setState({
          kind: "error",
          message: `Only ${quota.remaining} of your ${quota.limit} GitHub requests are left this hour. Deep secret scan reads a whole repository and would use most of them. Wait for the quota to reset, or run the ordinary Secret scan.`,
        });
        return;
      }
    }

    setState({ kind: "running" });
    const gh = new GitHubClient(token ?? undefined);
    const started = performance.now();

    try {
      const result = await runCommand(gh, activeId, values);
      const canSave = Boolean(token) && !command.sensitive;

      setQuota({ remaining: gh.rateLimit.remaining, limit: gh.rateLimit.limit });

      setState({
        kind: "done",
        result,
        remaining: gh.rateLimit.remaining,
        limit: gh.rateLimit.limit,
        ms: Math.round(performance.now() - started),
        permalink: null,
        saving: canSave,
      });

      if (!canSave) return;

      void saveReport(result, token ?? null).then((outcome) => {
        const target = reportTarget(result);
        const link =
          outcome.kind === "saved" && target
            ? reportPath(target.owner, target.repo, result.id)
            : null;
        setState((prev) =>
          prev.kind === "done" && prev.result === result
            ? {
                ...prev,
                permalink: link,
                saving: false,
                published: outcome.kind === "saved",
                saveOutcome: outcome.kind,
              }
            : prev,
        );
      });
    } catch (err) {
      if (err instanceof AuthError) {
        forgetGithubToken();
        setHasToken(false);
        setState({
          kind: "error",
          message:
            "Your GitHub session expired. Connect again to keep the higher limit.",
          needsReconnect: true,
        });
      } else if (err instanceof RateLimitError) {
        const at = err.resetAt
          ? err.resetAt.toLocaleTimeString("en-GB")
          : "shortly";
        setState({
          kind: "error",
          message: token
            ? `You have used up your GitHub API quota. It resets at ${at}.`
            : `Guest scanning is capped at 60 requests an hour and yours are gone until ${at}. Signing in with GitHub raises that to 5,000.`,
          needsReconnect: !token,
        });
      } else if (err instanceof NetworkError) {
        setState({
          kind: "error",
          message: `${err.message} — the request never left the browser. Usually that is an ad or tracker blocker, or a browser shield. On Brave, open the shield icon in the address bar and turn Shields off for this site, then try again.`,
        });
      } else if (err instanceof NotFoundError) {
        setState({
          kind: "error",
          message: err.message || "Could not find what you asked for.",
        });
      } else {
        setState({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Something unexpected went wrong.",
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
            <h2 className="text-lg font-semibold tracking-tight">
              {command.name}
            </h2>
            <code className="text-xs text-[var(--color-muted)]">
              {command.cli}
            </code>
          </div>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {command.summary}
          </p>
        </header>

        {command.sensitive && (
          <div className="space-y-2 rounded-lg border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-xs leading-relaxed text-amber-200/90">
            <p className="font-semibold text-amber-100">Before you run this</p>
            <p>
              This scan runs from your browser, using your GitHub token and your GitHub rate
              limit. GitHub decides at its own discretion what counts as excessive API use, and
              can suspend your account&apos;s API access. That lands on you, not on us.
            </p>
            <p>
              Findings are never saved, never shared, and every value is redacted — we show you
              the type of key and where it is, never the key itself.
            </p>
            <p>
              Secret scans only run on repositories you can push to, so anything found is yours to
              fix. Treat it as compromised from the moment it was pushed: rotate the key at the
              provider first, because deleting the file does not remove it from the history.
            </p>
            <p>
              A clean result does not mean the repository is clean. We check a limited number of
              recent commits against a limited set of known key formats.
            </p>
          </div>
        )}

        {locked && (
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-xs">
            <p className="text-[var(--color-text)]">
              This one needs a GitHub session
            </p>
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
                onChange={(v) =>
                  setValues((prev) => ({ ...prev, [field.key]: v }))
                }
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="submit"
              disabled={state.kind === "running" || locked}
              className="btn btn-primary"
            >
              {state.kind === "running" ? "Running…" : "Run"}
            </button>

            {state.kind === "done" && (
              <p className="text-xs text-[var(--color-muted)]">
                {state.ms} ms
                {state.remaining !== null &&
                  ` · ${state.remaining}${state.limit ? `/${state.limit}` : ""} requests left`}
              </p>
            )}
            {state.kind !== "done" && !hasToken && !locked && (
              <p className="text-xs text-[var(--color-muted)]">
                Running as a guest: 60 requests an hour.
              </p>
            )}
            {state.kind !== "done" && hasToken && quota.remaining !== null && (
              <p
                className={`text-xs ${
                  quota.limit && quota.remaining / quota.limit < 0.2
                    ? "text-[var(--color-warn)]"
                    : "text-[var(--color-muted)]"
                }`}
              >
                {quota.remaining}
                {quota.limit ? `/${quota.limit}` : ""} GitHub requests left this hour
              </p>
            )}
          </div>
        </form>

        {state.kind === "error" && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/25 p-4 text-sm">
            <p className="text-red-300">{state.message}</p>
            {state.needsReconnect && (
              <p className="mt-2 text-[var(--color-muted)]">
                Connect from the card at the top of the page.
              </p>
            )}
          </div>
        )}

        {state.kind === "running" && (
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-8 text-center text-sm text-[var(--color-muted)]">
            Scanning in your browser…
          </div>
        )}

        {state.kind === "done" && state.saving && (
          <p className="text-xs text-[var(--color-muted)]">
            Checking whether you can publish this…
          </p>
        )}

        {state.kind === "done" &&
          !state.saving &&
          !state.permalink &&
          !command.sensitive &&
          hasToken && (
            <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-4 text-xs leading-relaxed text-[var(--color-muted)]">
              {state.saveOutcome === "failed" ? (
                <>
                  <p className="text-sm text-[var(--color-text)]">
                    We could not save this one
                  </p>
                  <p className="mt-1.5">
                    The scan itself worked and everything above is real. Saving it failed on our
                    side, so it has no address yet. Run it again in a moment and it should stick.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-[var(--color-text)]">
                    This result is yours alone
                  </p>
                  <p className="mt-1.5">
                    Results are only published for repositories you can push to. You can read
                    everything above, but it has not been saved, it has no address, and it will
                    not appear in anyone else&apos;s feed.
                  </p>
                  <p className="mt-1.5">
                    Scan a repository you maintain and the result gets a permanent page you can
                    link to and a badge you can put in the README.
                  </p>
                </>
              )}
            </div>
          )}

        {state.kind === "done" && state.permalink && (
          <Permalink href={state.permalink} />
        )}

        {state.kind === "done" && !hasToken && !command.sensitive && (
          <SignInNudge />
        )}

        {state.kind === "done" && !command.sensitive && (
          <HubLink result={state.result} />
        )}

        {state.kind === "done" && <ResultView result={state.result} />}
      </div>
    </div>
  );
}

function HubLink({ result }: { result: CommandResult }) {
  const target = reportTarget(result);
  if (!target) return null;
  const label = target.repo ? `${target.owner}/${target.repo}` : target.owner;
  const href = target.repo
    ? `/app/r/${target.owner}/${target.repo}/`
    : `/app/u/${target.owner}/`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm">Everything known about {label}</p>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          The other scans, the README badge, the discussion, and Follow to hear
          when it changes.
        </p>
      </div>
      <a href={href} className="btn btn-ghost shrink-0">
        Open
      </a>
    </div>
  );
}

function SignInNudge() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm">This result lives only in this tab</p>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Sign in to keep it at a permanent address, get a README badge, and let
          others comment on it.
        </p>
      </div>
      <a href="/app/scan/" className="btn btn-ghost shrink-0">
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
        <p className="text-xs text-[var(--color-muted)]">
          Permanent address for this report
        </p>
        <a
          href={href}
          className="block truncate font-mono text-xs text-sky-400 hover:underline"
        >
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
        className="btn btn-ghost btn-sm shrink-0"
      >
        {copied ? "Copied" : "Copy"}
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
  const [picking, setPicking] = useState(false);

  return (
    <nav className="lg:sticky lg:top-6 lg:self-start">
      <button
        type="button"
        onClick={() => setPicking((v) => !v)}
        aria-expanded={picking}
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2.5 text-left text-sm lg:hidden"
      >
        <span className="min-w-0 truncate">{getCommand(activeId).name}</span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-[var(--color-muted)]">
          {picking ? "Close" : "Change"}
          <Icon
            name="chevron"
            size={14}
            className={`transition ${picking ? "-rotate-90" : "rotate-90"}`}
          />
        </span>
      </button>

      <ul
        className={`space-y-6 ${picking ? "mt-4" : "hidden"} lg:mt-0 lg:block`}
      >
        {CATEGORIES.map((category) => (
          <li key={category.id}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              {category.label}
            </p>
            <ul className="space-y-0.5">
              {COMMANDS.filter(
                (c) => c.category === (category.id as CommandCategory),
              ).map((c) => {
                const active = c.id === activeId;
                const needsAuth = Boolean(c.requiresAuth) && !hasToken;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(c.id);
                        setPicking(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition ${
                        active
                          ? "bg-[var(--color-surface)] text-[var(--color-text)]"
                          : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
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
  const inputClass = "field";

  if (field.kind === "checkbox") {
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
            <span className="block text-xs text-[var(--color-muted)]">
              {field.hint}
            </span>
          )}
        </span>
      </label>
    );
  }

  return (
    <label className={field.kind === "number" ? "" : "sm:col-span-2"}>
      <span className="mb-1.5 block text-xs text-[var(--color-muted)]">
        {field.label}
      </span>

      {field.kind === "select" ? (
        <select
          value={String(value ?? "")}
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
          type={field.kind === "number" ? "number" : "text"}
          value={String(value ?? "")}
          min={field.min}
          max={field.max}
          onChange={(e) =>
            onChange(
              field.kind === "number" ? Number(e.target.value) : e.target.value,
            )
          }
          placeholder={field.placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className={inputClass}
        />
      )}

      {field.hint && (
        <span className="mt-1 block text-xs text-[var(--color-muted)]">
          {field.hint}
        </span>
      )}
    </label>
  );
}
