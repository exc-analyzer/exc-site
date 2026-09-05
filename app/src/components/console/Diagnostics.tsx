import { useState } from "react";
import { getGithubToken } from "../../lib/githubToken";

interface Probe {
  name: string;
  url: string;
  needsToken: boolean;
  simple: boolean;
  note: string;
}

const PROBES: Probe[] = [
  {
    name: "REST API",
    url: "https://api.github.com/rate_limit",
    needsToken: false,
    simple: false,
    note: "Most commands go through this.",
  },
  {
    name: "GraphQL",
    url: "https://api.github.com/graphql",
    needsToken: true,
    simple: false,
    note: "Repository analysis runs on this.",
  },
  {
    name: "File contents (API)",
    url: "https://api.github.com/repos/exc-analyzer/exc/contents/README.md",
    needsToken: false,
    simple: false,
    note: "Where every file read now goes.",
  },
];

type Outcome =
  | { kind: "pending" }
  | { kind: "ok"; status: number; ms: number }
  | { kind: "http"; status: number; ms: number }
  | { kind: "blocked"; detail: string }
  | { kind: "skipped" };

export default function Diagnostics() {
  const [results, setResults] = useState<Record<string, Outcome>>({});
  const [running, setRunning] = useState(false);

  async function runAll() {
    setRunning(true);
    const token = getGithubToken();
    const next: Record<string, Outcome> = {};
    for (const p of PROBES) next[p.name] = { kind: "pending" };
    setResults({ ...next });

    for (const probe of PROBES) {
      if (probe.needsToken && !token) {
        next[probe.name] = { kind: "skipped" };
        setResults({ ...next });
        continue;
      }
      const started = performance.now();
      try {
        const res =
          probe.name === "GraphQL"
            ? await fetch(probe.url, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ query: "{ viewer { login } }" }),
              })
            : probe.simple
              ? await fetch(probe.url)
              : await fetch(probe.url, {
                  headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                  },
                });
        const ms = Math.round(performance.now() - started);
        next[probe.name] = res.ok
          ? { kind: "ok", status: res.status, ms }
          : { kind: "http", status: res.status, ms };
      } catch (err) {
        next[probe.name] = {
          kind: "blocked",
          detail: err instanceof Error ? err.message : String(err),
        };
      }
      setResults({ ...next });
    }
    setRunning(false);
  }

  const anyBlocked = Object.values(results).some((r) => r.kind === "blocked");

  return (
    <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Connection test</h3>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            If a command reports that it could not reach something, this tells
            you which host is being blocked.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runAll()}
          disabled={running}
          className="btn btn-ghost shrink-0"
        >
          {running ? "Testing…" : "Run the test"}
        </button>
      </div>

      {Object.keys(results).length > 0 && (
        <ul className="mt-5 divide-y divide-[var(--color-line)]">
          {PROBES.map((probe) => {
            const r = results[probe.name];
            if (!r) return null;
            return (
              <li
                key={probe.name}
                className="flex items-start justify-between gap-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm">{probe.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {probe.note}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  {r.kind === "pending" && (
                    <span className="text-[var(--color-muted)]">…</span>
                  )}
                  {r.kind === "ok" && (
                    <span className="text-emerald-400">
                      Reached · {r.ms} ms
                    </span>
                  )}
                  {r.kind === "http" && (
                    <span className="text-amber-400">
                      Reached, but HTTP {r.status}
                      <span className="block text-[var(--color-muted)]">
                        not a network problem — permissions or quota
                      </span>
                    </span>
                  )}
                  {r.kind === "blocked" && (
                    <span className="text-red-400">
                      Unreachable
                      <span className="block text-[var(--color-muted)]">
                        {r.detail}
                      </span>
                    </span>
                  )}
                  {r.kind === "skipped" && (
                    <span className="text-[var(--color-muted)]">
                      Needs a token
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {anyBlocked && (
        <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/25 px-4 py-3 text-xs text-red-200/90">
          At least one host is unreachable. The usual causes are an ad or
          tracker blocker, a browser shield, a corporate network filter, an ISP
          block, or a VPN. Try opening the same address directly in a tab: if
          that fails too, the block is outside this page.
        </p>
      )}
    </section>
  );
}
