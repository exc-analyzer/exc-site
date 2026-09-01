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
import { SITE_URL } from '../../lib/site';
import Comments from './Comments';
import RepoHub from './RepoHub';

interface Target {
  owner: string;
  repo: string;
  kind: CommandId;
}

const VALID_KINDS = new Set(COMMANDS.map((c) => c.id));

type Route =
  | { view: 'hub'; owner: string; repo: string }
  | { view: 'report'; owner: string; repo: string; kind: CommandId }
  | null;

function reportRoute(owner: string, repo: string, kind: string): Route {
  if (!VALID_KINDS.has(kind as CommandId)) return null;
  return { view: 'report', owner, repo, kind: kind as CommandId };
}

function parseRoute(): Route {
  if (typeof window === 'undefined') return null;
  const query = new URLSearchParams(window.location.search).get('t');
  const source = query ?? window.location.pathname;
  const parts = source
    .replace(/^\/app\//, '')
    .split('/')
    .filter(Boolean);
  const prefix = parts[0] === 'r' || parts[0] === 'u' ? parts[0] : null;
  const scoped = prefix ? parts.slice(1) : parts;

  if (prefix === 'r') {
    if (scoped.length === 2) return { view: 'hub', owner: scoped[0], repo: scoped[1] };
    if (scoped.length === 3) return reportRoute(scoped[0], scoped[1], scoped[2]);
    return null;
  }
  if (prefix === 'u') {
    if (scoped.length === 1) return { view: 'hub', owner: scoped[0], repo: '' };
    if (scoped.length === 2) return reportRoute(scoped[0], '', scoped[1]);
    return null;
  }
  if (scoped.length === 3) return reportRoute(scoped[0], scoped[1], scoped[2]);
  if (scoped.length === 2) return reportRoute(scoped[0], '', scoped[1]);
  return null;
}
type State =
  | { kind: 'loading' }
  | { kind: 'bad-url' }
  | { kind: 'missing'; target: Target }
  | { kind: 'ready'; target: Target; report: StoredReport; siblings: StoredReport[] };
export default function ReportPage() {
  const [route, setRoute] = useState<Route | undefined>();
  useEffect(() => {
    setRoute(parseRoute());
  }, []);
  if (route === undefined) return null;
  if (route && route.view === 'hub') return <RepoHub owner={route.owner} repo={route.repo} />;
  return <ReportDetail target={route} />;
}

function ReportDetail({ target: parsed }: { target: Target | null }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    document.getElementById('exc-prerendered')?.remove();
    const target = parsed;
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
    return <p className="text-sm text-[var(--color-muted)]">Loading…</p>;
  }
  if (state.kind === 'bad-url') {
    return (
      <Card>
        <div className="px-6 py-8">
          <Empty>
            This address does not point at a report.{' '}
            <a href="/app/" className="text-sky-400 hover:underline">
              Back to the app
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
              No <strong>{getCommand(state.target.kind).name}</strong> report for this target yet.
              Nobody has run one.{' '}
              <a href="/app/" className="text-sky-400 hover:underline">
                Be the first
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
                Last scanned by{' '}
                <ExternalLink href={`https://github.com/${scanner}`}>{scanner}</ExternalLink>
              </>
            ) : (
              'Last scanner unknown'
            )}{' '}
            · {relativeTime(report.updated_at)} · scanned {report.scan_count} times
          </p>
          <a href="/app/" className="text-sky-400 hover:underline">
            Scan again
          </a>
        </div>
      </Card>
      {target.kind === 'security-score' && target.repo && (
        <BadgeSnippet owner={target.owner} repo={target.repo} />
      )}
      <Comments reportId={report.id} />
      {siblings.length > 0 && (
        <Card>
          <div className="px-6 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Other reports for this target
            </p>
            <ul className="flex flex-wrap gap-2">
              {siblings.map((s) => (
                <li key={s.kind}>
                  <a
                    href={
                      s.repo
                        ? `/app/r/${s.owner}/${s.repo}/${s.kind}/`
                        : `/app/u/${s.owner}/${s.kind}/`
                    }
                    className="inline-flex rounded-full border border-[var(--color-line)] px-3 py-1 text-xs transition hover:border-[var(--color-line-active)]"
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
function BadgeSnippet({ owner, repo }: { owner: string; repo: string }) {
  const [copied, setCopied] = useState(false);
  const badgeUrl = `https://img.shields.io/endpoint?url=${encodeURIComponent(`${SITE_URL}/badge/${owner}/${repo}.json`)}`;
  const pageUrl = `${SITE_URL}/app/r/${owner}/${repo}/security-score/`;
  const markdown = `[![EXC security](${badgeUrl})](${pageUrl})`;
  return (
    <Card>
      <div className="space-y-3 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">README badge</h2>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Drop it in your repository. The score refreshes itself every night.
            </p>
          </div>
          <img src={badgeUrl} alt="" height={20} />
        </div>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-xs">
            {markdown}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(markdown).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              });
            }}
            className="shrink-0 rounded-lg border border-[var(--color-line)] px-3 py-2 text-xs transition hover:border-[var(--color-line-active)]"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </Card>
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