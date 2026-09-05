import { useEffect, useRef, useState } from "react";
import { GitHubClient, NotFoundError, RateLimitError } from "../../lib/github";
import { getGithubToken } from "../../lib/githubToken";
import { probablySignedIn } from "../../lib/profile";
import {
  securityScore,
  type SecurityScoreResult,
} from "../../engine/securityScore";
import { parseRepo } from "../../lib/pins";
import { SITE_URL } from "../../lib/site";
import { ScoreRing } from "../console/ui";
import Icon from "../Icon";

type Stage = "idle" | "first" | "second" | "running" | "done";
type Side = "a" | "b";

interface Progress {
  label: string;
  done: number;
  total: number;
}

interface Slot {
  name: string;
  result: SecurityScoreResult | null;
  problem: string | null;
  progress: Progress | null;
}

const BLANK: Slot = { name: "", result: null, problem: null, progress: null };

function explain(err: unknown): string {
  if (err instanceof RateLimitError) {
    const when = err.resetAt
      ? err.resetAt.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    if (getGithubToken()) {
      return `You have used up your GitHub quota${when ? `. It comes back at ${when}` : ""}.`;
    }
    if (probablySignedIn()) {
      return `This tab is not connected to GitHub, so it is using the anonymous allowance of 60 an hour${when ? `, which runs out until ${when}` : ""}. Reconnect on the scan page and it will use your own 5,000.`;
    }
    return `GitHub allows 60 checks an hour without an account, and a comparison uses several per repository. Sign in to work on your own 5,000${when ? `, or come back at ${when}` : ""}.`;
  }
  if (err instanceof NotFoundError) {
    return "GitHub has no repository by that name.";
  }
  return err instanceof Error ? err.message : "That did not run.";
}

function tone(status: string): string {
  if (status === "pass") return "var(--color-good)";
  if (status === "fail") return "var(--color-bad)";
  return "var(--color-faint)";
}

function mark(status: string): string {
  if (status === "pass") return "check";
  if (status === "fail") return "cross";
  return "dash";
}

function ringTone(score: number): "good" | "warn" | "bad" {
  if (score >= 90) return "good";
  if (score >= 75) return "warn";
  return "bad";
}

function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / 700);
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to]);

  return <ScoreRing value={n} tone={ringTone(to)} />;
}

function Working({ slot }: { slot: Slot }) {
  const pct = slot.progress
    ? Math.round((slot.progress.done / slot.progress.total) * 100)
    : 4;

  return (
    <div className="flex items-center gap-4">
      <span className="pulse-ring grid size-[76px] shrink-0 place-items-center rounded-full border-2 border-dashed border-[var(--color-line-strong)] text-xs text-[var(--color-faint)]">
        {pct}%
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm text-[var(--color-text)]">
          {slot.name}
        </p>
        <p className="mt-1 truncate text-xs text-[var(--color-muted)]">
          {slot.problem ?? `${slot.progress?.label ?? "Starting"}…`}
        </p>
        <span className="sweep relative mt-2 block h-1 overflow-hidden rounded-full bg-[var(--color-line)]">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-accent)] transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </span>
      </div>
    </div>
  );
}

export default function Compare() {
  const [stage, setStage] = useState<Stage>("idle");
  const [draft, setDraft] = useState("");
  const [entryError, setEntryError] = useState<string | null>(null);
  const [a, setA] = useState<Slot>(BLANK);
  const [b, setB] = useState<Slot>(BLANK);
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === "first" || stage === "second") field.current?.focus();
  }, [stage]);

  async function score(side: Side, name: string) {
    const set = side === "a" ? setA : setB;
    const parsed = parseRepo(name);
    if (!parsed) {
      set((prev) => ({ ...prev, problem: "That is not a repository name." }));
      return;
    }
    try {
      const gh = new GitHubClient(getGithubToken() ?? undefined);
      const result = await securityScore(
        gh,
        parsed.owner,
        parsed.repo,
        (label, done, total) =>
          set((prev) => ({ ...prev, progress: { label, done, total } })),
      );
      set((prev) => ({
        ...prev,
        name: `${result.owner}/${result.repo}`,
        result,
        progress: null,
      }));
    } catch (err) {
      set((prev) => ({ ...prev, problem: explain(err), progress: null }));
    }
  }

  async function begin(firstName: string, secondName: string) {
    setA({ ...BLANK, name: firstName });
    setB({ ...BLANK, name: secondName });
    setStage("running");
    await Promise.all([score("a", firstName), score("b", secondName)]);
    setStage("done");
  }

  function submit() {
    const parsed = parseRepo(draft);
    if (!parsed) {
      setEntryError("Write it as owner/repo, or paste the GitHub address.");
      return;
    }
    const name = `${parsed.owner}/${parsed.repo}`;
    setEntryError(null);
    if (stage === "first") {
      setA({ ...BLANK, name });
      setDraft("");
      setStage("second");
      return;
    }
    if (name.toLowerCase() === a.name.toLowerCase()) {
      setEntryError("That is the same repository. Pick a different one.");
      return;
    }
    setDraft("");
    void begin(a.name, name);
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const left = q.get("a");
    const right = q.get("b");
    if (left && right && parseRepo(left) && parseRepo(right)) {
      void begin(left, right);
    }
  }, []);

  function restart() {
    setA(BLANK);
    setB(BLANK);
    setDraft("");
    setEntryError(null);
    setStage("first");
  }

  const rows =
    a.result && b.result
      ? a.result.criteria.map((left) => ({
          left,
          right: b.result!.criteria.find((c) => c.id === left.id) ?? null,
        }))
      : [];

  const differing = rows.filter(
    (row) => row.right && row.right.status !== row.left.status,
  );

  function shareLink() {
    const q = new URLSearchParams();
    if (a.result) q.set("a", `${a.result.owner}/${a.result.repo}`);
    if (b.result) q.set("b", `${b.result.owner}/${b.result.repo}`);
    return `${SITE_URL}/app/compare/?${q.toString()}`;
  }

  if (stage === "idle") {
    return (
      <section className="step-in surface grid place-items-center px-6 py-16 text-center">
        <span className="grid size-14 place-items-center rounded-full border border-[var(--color-line-strong)] text-[var(--color-accent)]">
          <Icon name="rows" size={22} />
        </span>
        <h2 className="mt-5 text-lg font-semibold">
          Two repositories, the same questions
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--color-muted)]">
          You give one, then the other. Both are read in your browser against
          public GitHub data, and you watch each check land.
        </p>
        <button
          type="button"
          className="btn btn-primary mt-6"
          onClick={() => setStage("first")}
        >
          Start a comparison
        </button>
      </section>
    );
  }

  if (stage === "first" || stage === "second") {
    const second = stage === "second";
    return (
      <section className="step-in surface px-6 py-10">
        <div className="mx-auto max-w-md">
          <p className="text-2xs uppercase tracking-wider text-[var(--color-faint)]">
            Step {second ? "two" : "one"} of two
          </p>
          <h2 className="mt-2 text-lg font-semibold">
            {second ? "And against what?" : "Which one first?"}
          </h2>

          {second && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-3 py-1.5 font-mono text-xs text-[var(--color-muted)]">
              <Icon name="check" size={12} />
              {a.name}
            </p>
          )}

          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              ref={field}
              className="field flex-1"
              value={draft}
              placeholder="owner/repo"
              onChange={(e) => {
                setDraft(e.target.value);
                setEntryError(null);
              }}
            />
            <button
              type="submit"
              className="btn btn-primary shrink-0"
              disabled={!draft.trim()}
            >
              {second ? "Compare them" : "Next"}
            </button>
          </form>

          {entryError && (
            <p className="mt-3 text-xs text-[var(--color-bad)]">{entryError}</p>
          )}
        </div>
      </section>
    );
  }

  if (stage === "running") {
    return (
      <section className="step-in surface p-6">
        <p className="text-2xs uppercase tracking-wider text-[var(--color-faint)]">
          Reading both
        </p>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          {[a, b].map((slot, i) => (
            <div key={i}>
              {slot.result ? (
                <div className="flex items-center gap-4">
                  <CountUp to={slot.result.score} />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm">{slot.name}</p>
                    <p className="mt-1 text-xs text-[var(--color-good)]">Done</p>
                  </div>
                </div>
              ) : (
                <Working slot={slot} />
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }

  const failed = !a.result || !b.result;

  return (
    <div className="step-in space-y-6">
      <section className="surface p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          {[a, b].map((slot, i) => (
            <div key={i} className="flex items-center gap-4">
              {slot.result ? (
                <>
                  <CountUp to={slot.result.score} />
                  <div className="min-w-0">
                    <a
                      href={`https://github.com/${slot.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate font-mono text-sm hover:underline"
                    >
                      {slot.name}
                    </a>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      {slot.result.checksPassed} of {slot.result.evaluatedCount}{" "}
                      checks passed
                    </p>
                    {slot.result.unknownCount > 0 && (
                      <p className="text-xs text-[var(--color-faint)]">
                        {slot.result.unknownCount} could not be read
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{slot.name}</p>
                  <p className="mt-1 text-xs text-[var(--color-bad)]">
                    {slot.problem}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {!failed && (
          <p className="mt-5 border-t border-[var(--color-line)] pt-4 text-sm text-[var(--color-muted)]">
            {differing.length === 0
              ? "Every check lands the same way for both. On what this measures, there is nothing to choose between them."
              : `${differing.length} check${differing.length === 1 ? "" : "s"} separate${differing.length === 1 ? "s" : ""} them.`}
          </p>
        )}
      </section>

      {!failed && (
        <section className="surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left text-xs text-[var(--color-faint)]">
                <th className="px-5 py-3 font-medium">Check</th>
                <th className="px-3 py-3 text-center font-medium">
                  {a.result!.repo}
                </th>
                <th className="px-3 py-3 text-center font-medium">
                  {b.result!.repo}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ left, right }, i) => {
                const split = right && right.status !== left.status;
                return (
                  <tr
                    key={left.id}
                    className={`step-in border-b border-[var(--color-line)] last:border-0 ${
                      split ? "bg-[rgba(163,145,224,0.05)]" : ""
                    }`}
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    <td className="px-5 py-3">
                      <span className="text-[var(--color-text)]">
                        {left.label}
                      </span>
                      {left.weight > 0 && (
                        <span className="ml-2 text-2xs text-[var(--color-faint)]">
                          {left.weight} points
                        </span>
                      )}
                    </td>
                    {[left, right].map((cell, j) => (
                      <td key={j} className="px-3 py-3 text-center">
                        {cell ? (
                          <span
                            className="inline-flex"
                            style={{ color: tone(cell.status) }}
                            title={cell.detail}
                          >
                            <Icon name={mark(cell.status)} size={15} />
                          </span>
                        ) : (
                          <span className="text-[var(--color-faint)]">
                            &ndash;
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-quiet btn-sm" onClick={restart}>
          Compare two more
        </button>
        {!failed && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => {
              void navigator.clipboard.writeText(shareLink());
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Icon name="copy" size={14} />
            {copied ? "Link copied" : "Copy a link to this"}
          </button>
        )}
        <p className="text-2xs text-[var(--color-faint)]">
          The link re-runs both scores for whoever opens it, on their own GitHub
          quota. Nothing here is stored.
        </p>
      </div>
    </div>
  );
}
