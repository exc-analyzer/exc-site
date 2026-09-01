import { useEffect, useState } from 'react';
import { COMMANDS, getCommand, type CommandId } from '../../engine';
import { loadTargetReports, type StoredReport } from '../../lib/reports';
import { loadRepoComments, type RepoComment } from '../../lib/comments';
import { Card, Empty, ExternalLink, SectionTitle, Verdict } from '../console/ui';
import type { Tone } from '../console/ui';
import { relativeTime } from '../../engine/shared';
import BadgeSnippet from './BadgeSnippet';

interface Line {
  tone: Tone;
  headline: string;
  detail: string;
}

function describe(report: StoredReport): Line {
  const s = report.summary as Record<string, unknown>;
  switch (report.kind) {
    case 'security-score': {
      const score = report.score ?? 0;
      const failing = Array.isArray(s.criteria)
        ? (s.criteria as { status: string }[]).filter((c) => c.status === 'fail').length
        : 0;
      return {
        tone: score >= 90 ? 'good' : score >= 75 ? 'warn' : 'bad',
        headline: `${score}/100`,
        detail: failing === 0 ? 'Everything checked is met' : `${failing} criteria not met`,
      };
    }
    case 'content-audit': {
      const present = Number(s.presentCount ?? 0);
      const total = Number(s.totalCount ?? 0);
      return {
        tone: present === total ? 'good' : present >= total - 1 ? 'warn' : 'bad',
        headline: `${present}/${total} files`,
        detail: present === total ? 'Every standard file is there' : 'Standard files are missing',
      };
    }
    case 'actions-audit': {
      const workflows = Array.isArray(s.workflows) ? (s.workflows as { severity: string }[]) : [];
      const serious = workflows.filter(
        (w) => w.severity === 'critical' || w.severity === 'risky',
      ).length;
      if (!s.hasWorkflows) {
        return { tone: 'muted', headline: 'No workflows', detail: 'Nothing to audit' };
      }
      return {
        tone: serious > 0 ? 'bad' : 'good',
        headline: serious > 0 ? `${serious} at risk` : 'Clean',
        detail: `${workflows.length} workflow${workflows.length === 1 ? '' : 's'} examined`,
      };
    }
    case 'commit-anomaly': {
      const flagged = Array.isArray(s.risky) ? s.risky.length : 0;
      return {
        tone: flagged === 0 ? 'good' : 'warn',
        headline: flagged === 0 ? 'Nothing flagged' : `${flagged} flagged`,
        detail: `${Number(s.scannedCount ?? 0)} commits scanned`,
      };
    }
    case 'contrib-impact': {
      const people = Array.isArray(s.contributors) ? s.contributors.length : 0;
      return {
        tone: people <= 1 ? 'warn' : 'good',
        headline: people === 0 ? 'No data' : `${people} ${people === 1 ? 'person' : 'people'}`,
        detail: people <= 1 ? 'The work sits on one person' : 'The work is shared',
      };
    }
    case 'analysis': {
      const stars = Number(s.stars ?? 0);
      return {
        tone: 'info',
        headline: `${stars.toLocaleString('en-US')} stars`,
        detail: `Last updated ${relativeTime(String(s.updatedAt ?? report.updated_at))}`,
      };
    }
    case 'file-history': {
      const commits = Array.isArray(s.commits) ? s.commits.length : 0;
      return {
        tone: 'info',
        headline: `${commits} commit${commits === 1 ? '' : 's'}`,
        detail: String(s.path ?? ''),
      };
    }
    case 'user-anomaly': {
      const score = report.score ?? 0;
      return {
        tone: score < 30 ? 'good' : score < 60 ? 'warn' : 'bad',
        headline: `${score}/100 risk`,
        detail: score < 30 ? 'Behaves ordinarily' : 'Worth a look',
      };
    }
    case 'user-analysis': {
      const repos = Number(s.publicRepos ?? 0);
      return {
        tone: 'info',
        headline: `${repos} repositor${repos === 1 ? 'y' : 'ies'}`,
        detail: `${Number(s.followers ?? 0)} followers`,
      };
    }
    default:
      return { tone: 'muted', headline: 'Scanned', detail: '' };
  }
}

const TONE_RING: Record<string, string> = {
  good: 'border-emerald-800/60',
  warn: 'border-amber-800/60',
  bad: 'border-red-900/60',
  info: 'border-[var(--color-line)]',
  muted: 'border-[var(--color-line)]',
};

export default function RepoHub({ owner, repo }: { owner: string; repo: string }) {
  const [reports, setReports] = useState<StoredReport[] | null>(null);
  const [discussion, setDiscussion] = useState<RepoComment[]>([]);

  useEffect(() => {
    document.getElementById('exc-prerendered')?.remove();
    void (async () => {
      const [found, comments] = await Promise.all([
        loadTargetReports(owner, repo),
        loadRepoComments(owner, repo),
      ]);
      setReports(found);
      setDiscussion(comments);
    })();
  }, [owner, repo]);

  const label = repo ? `${owner}/${repo}` : owner;
  const githubUrl = repo ? `https://github.com/${owner}/${repo}` : `https://github.com/${owner}`;
  const relevant = COMMANDS.filter((c) =>
    repo ? !c.id.startsWith('user-') : c.id.startsWith('user-'),
  ).filter((c) => !c.sensitive);

  const scanHref = repo
    ? `/app/?repo=${encodeURIComponent(`${owner}/${repo}`)}`
    : `/app/?user=${encodeURIComponent(owner)}`;

  const cardVersion = (reports ?? [])
    .map((r) => r.updated_at.slice(0, 10))
    .sort()
    .at(-1);

  const byKind = new Map((reports ?? []).map((r) => [r.kind, r]));
  const ordered = [...relevant].sort(
    (a, b) => Number(byKind.has(b.id)) - Number(byKind.has(a.id)),
  );
  const security = byKind.get('security-score');
  const scanned = reports?.length ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
            {repo ? 'Repository' : 'Account'}
          </p>
          <h1 className="mt-1 font-mono text-2xl tracking-tight">{label}</h1>
        </div>
        <ExternalLink href={githubUrl}>View on GitHub</ExternalLink>
      </header>

      {reports === null ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : scanned === 0 ? (
        <Card>
          <div className="px-6 py-10 text-center">
            <p className="text-base">Nobody has scanned this yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">
              Run the first scan and this page becomes the place where everything known about{' '}
              {label} is gathered.
            </p>
            <a href={scanHref} className="btn btn-primary mt-5">
              Scan it
            </a>
          </div>
        </Card>
      ) : (
        <>
          {security ? (
            <Verdict
              tone={describe(security).tone}
              headline={verdictHeadline(security)}
              summary={verdictSummary(security)}
              score={{ value: security.score ?? 0, caption: label }}
            />
          ) : (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
                <div className="min-w-0">
                  <p className="text-sm">No security score yet</p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                    That is the one that answers whether this repository can be trusted.
                  </p>
                </div>
                <a
                  href={
                    repo
                      ? `/app/?cmd=security-score&repo=${encodeURIComponent(`${owner}/${repo}`)}`
                      : scanHref
                  }
                  className="btn btn-ghost shrink-0"
                >
                  Run it
                </a>
              </div>
            </Card>
          )}

          <div>
            <SectionTitle>What is known</SectionTitle>
            <ul className="grid gap-3 sm:grid-cols-2">
              {ordered.map((command) => {
                const report = byKind.get(command.id);
                const line = report ? describe(report) : null;
                const href = repo
                  ? `/app/r/${owner}/${repo}/${command.id}/`
                  : `/app/u/${owner}/${command.id}/`;
                const runHref = repo
                  ? `/app/?cmd=${command.id}&repo=${encodeURIComponent(`${owner}/${repo}`)}`
                  : `/app/?cmd=${command.id}&user=${encodeURIComponent(owner)}`;
                return (
                  <li key={command.id}>
                    <a
                      href={report ? href : runHref}
                      className={`block h-full rounded-xl border bg-[var(--color-surface)] p-4 transition hover:border-[var(--color-line-active)] ${
                        report ? TONE_RING[line!.tone] : 'border-dashed border-[var(--color-line)]'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium">{command.name}</span>
                        {report && (
                          <span className="shrink-0 text-xs text-[var(--color-faint)]">
                            {relativeTime(report.updated_at)}
                          </span>
                        )}
                      </div>
                      {report ? (
                        <>
                          <p className="mt-2 text-lg tabular-nums">{line!.headline}</p>
                          <p className="mt-0.5 text-xs text-[var(--color-muted)]">{line!.detail}</p>
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-[var(--color-muted)]">
                          Not run yet — you can be the first.
                        </p>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          {security && repo && (
            <BadgeSnippet
              owner={owner}
              repo={repo}
              score={security.score}
              cardVersion={cardVersion}
            />
          )}

          <Card>
            <div className="px-6 py-5">
              <div className="flex items-baseline justify-between gap-4">
                <SectionTitle>Discussion</SectionTitle>
                <span className="text-xs text-[var(--color-muted)]">
                  {discussion.length === 0 ? 'nothing yet' : `${discussion.length} recent`}
                </span>
              </div>
              {discussion.length === 0 ? (
                <Empty>
                  No one has said anything about {label} yet. Open a report and start it off.
                </Empty>
              ) : (
                <ul className="space-y-4">
                  {discussion.map((c) => {
                    const kind = c.report?.kind as CommandId | undefined;
                    const href = kind
                      ? repo
                        ? `/app/r/${owner}/${repo}/${kind}/`
                        : `/app/u/${owner}/${kind}/`
                      : '#';
                    return (
                      <li key={c.id} className="border-l-2 border-[var(--color-line)] pl-4">
                        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--color-muted)]">
                          {c.author?.avatar_url && (
                            <img
                              src={c.author.avatar_url}
                              alt=""
                              width={16}
                              height={16}
                              className="rounded-full"
                            />
                          )}
                          <span className="text-[var(--color-text)]">
                            {c.author?.gh_login ?? 'someone'}
                          </span>
                          {kind && (
                            <>
                              <span>on</span>
                              <a href={href} className="text-sky-400 hover:underline">
                                {getCommand(kind).name}
                              </a>
                            </>
                          )}
                          <span>· {relativeTime(c.created_at)}</span>
                        </div>
                        <p className="mt-1 line-clamp-3 text-sm">{c.body}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-4">
            <p className="text-sm text-[var(--color-muted)]">
              Scans run in your browser. Re-running one updates this page for everybody.
            </p>
            <a href={scanHref} className="btn btn-ghost shrink-0">
              Scan {label}
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function verdictHeadline(report: StoredReport): string {
  const score = report.score ?? 0;
  if (score >= 90) return 'This repository is well defended';
  if (score >= 75) return 'The basics are there, a few gaps remain';
  return 'Several important things are missing';
}

function verdictSummary(report: StoredReport): string {
  const who = report.profiles?.gh_login;
  const parts = [
    `Scanned ${relativeTime(report.updated_at)}${who ? ` by ${who}` : ''}.`,
    `Run ${report.scan_count} time${report.scan_count === 1 ? '' : 's'} in total.`,
    'Open the security score for what to fix first.',
  ];
  return parts.join(' ');
}

export { describe as describeReport };
export type { Line as ReportLine };
