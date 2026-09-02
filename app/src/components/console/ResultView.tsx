import type { CommandResult } from '../../engine';
import type { Tone } from './ui';
import {
  ActionList,
  Badge,
  Bar,
  Card,
  CardHead,
  Details,
  Empty,
  ExternalLink,
  GoodList,
  KeyValues,
  Score,
  SectionTitle,
  Stats,
  Table,
  Verdict,
  toneText,
} from './ui';
import { formatDate, relativeTime } from '../../engine/shared';

const NUM = 'en-US';

export function ResultView({ result }: { result: CommandResult }) {
  switch (result.id) {
    case 'analysis':
      return <AnalysisView data={result.data} />;
    case 'security-score':
      return <SecurityScoreView data={result.data} />;
    case 'content-audit':
      return <ContentAuditView data={result.data} />;
    case 'contrib-impact':
      return <ContribImpactView data={result.data} />;
    case 'file-history':
      return <FileHistoryView data={result.data} />;
    case 'actions-audit':
      return <ActionsAuditView data={result.data} />;
    case 'commit-anomaly':
      return <CommitAnomalyView data={result.data} />;
    case 'user-analysis':
      return <UserAnalysisView data={result.data} />;
    case 'user-anomaly':
      return <UserAnomalyView data={result.data} />;
    case 'scan-secrets':
      return <ScanSecretsView data={result.data} />;
    case 'advanced-secrets':
      return <AdvancedSecretsView data={result.data} />;
    case 'dork-scan':
      return <DorkScanView data={result.data} />;
  }
}

function SensitiveNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-xs text-amber-200/90">
      {children}
    </div>
  );
}

type A = Extract<CommandResult, { id: 'analysis' }>['data'];

function AnalysisView({ data }: { data: A }) {
  const daysSinceUpdate = data.updatedAt
    ? Math.floor((Date.now() - new Date(data.updatedAt).getTime()) / 86_400_000)
    : null;
  const topTotal = data.topContributors.reduce((sum, c) => sum + c.contributions, 0);
  const topShare = topTotal > 0 ? data.topContributors[0].contributions / topTotal : 0;
  const concentrated = data.topContributors.length > 0 && topShare > 0.8;
  const stale = daysSinceUpdate !== null && daysSinceUpdate > 365;
  const slowing = daysSinceUpdate !== null && daysSinceUpdate > 180 && !stale;

  let tone: Tone = 'good';
  let headline: string;
  if (stale) {
    tone = 'bad';
    headline = 'Untouched for over a year';
  } else if (slowing) {
    tone = 'warn';
    headline = 'Quiet for a long time';
  } else if (concentrated) {
    tone = 'warn';
    headline = 'Active, but resting on one person';
  } else {
    headline = 'Active, and more than one person carries it';
  }

  const parts: string[] = [`Last updated ${relativeTime(data.updatedAt)}.`];
  if (data.totalContributors > 0) {
    parts.push(
      concentrated
        ? `${Math.round(topShare * 100)}% of the contributions come from a single person (${data.topContributors[0].login}). If they walk away, nobody is left holding it.`
        : `${data.totalContributors} people have contributed, and the load looks spread out.`,
    );
  }
  if (data.openIssues > 50) {
    parts.push(`${data.openIssues} open issues have piled up.`);
  }

  return (
    <div className="space-y-5">
      <Verdict tone={tone} headline={headline} summary={parts.join(' ')} />
      <Card>
        <CardHead
          title={`${data.owner}/${data.repo}`}
          subtitle={data.description ?? 'No description'}
        />
        <div className="space-y-8 p-6">
          <Stats
            items={[
              { label: 'Stars', value: data.stars.toLocaleString(NUM) },
              { label: 'Forks', value: data.forks.toLocaleString(NUM) },
              { label: 'Open issues', value: data.openIssues.toLocaleString(NUM) },
              { label: 'Pull requests', value: data.totalPullRequests.toLocaleString(NUM) },
            ]}
          />
          {data.languages.length > 0 && (
            <div>
              <SectionTitle>Languages</SectionTitle>
              <ul className="space-y-2.5">
                {data.languages.slice(0, 5).map((l) => (
                  <li key={l.name}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{l.name}</span>
                      <span className="tabular-nums text-[var(--color-muted)]">
                        {l.percent.toFixed(1)}%
                      </span>
                    </div>
                    <Bar percent={l.percent} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <SectionTitle>Who carries it</SectionTitle>
            {data.topContributors.length === 0 ? (
              <Empty>No contribution records found.</Empty>
            ) : (
              <ul className="space-y-2.5">
                {data.topContributors.map((c) => {
                  const share = topTotal > 0 ? (c.contributions / topTotal) * 100 : 0;
                  return (
                    <li key={c.login}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="truncate">{c.login}</span>
                        <span className="tabular-nums text-[var(--color-muted)]">
                          {c.contributions.toLocaleString(NUM)}
                        </span>
                      </div>
                      <Bar percent={share} tone={concentrated && share > 80 ? 'warn' : 'info'} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <Details summary="Other details">
            <KeyValues
              items={[
                {
                  label: 'Created',
                  value: `${formatDate(data.createdAt)} · ${relativeTime(data.createdAt)}`,
                },
                { label: 'Default branch', value: <code>{data.defaultBranch}</code> },
                { label: 'License', value: data.license ?? 'None' },
                { label: 'Commits examined', value: String(data.commitsAnalyzed) },
                {
                  label: 'Recent committers',
                  value: data.topCommitters.map((c) => c.name).join(', ') || '—',
                },
              ]}
            />
          </Details>
        </div>
      </Card>
    </div>
  );
}

type S = Extract<CommandResult, { id: 'security-score' }>['data'];

function SecurityScoreView({ data }: { data: S }) {
  const failing = data.criteria.filter((c) => c.status === 'fail');
  const passing = data.criteria.filter((c) => c.status === 'pass');
  const unknown = data.criteria.filter((c) => c.status === 'unknown');
  const lost = failing.reduce((sum, c) => sum + c.weight, 0);

  const tone: Tone = data.verdict === 'excellent' ? 'good' : data.verdict === 'good' ? 'warn' : 'bad';
  const headline =
    data.verdict === 'excellent'
      ? 'Security hygiene is in good shape'
      : data.verdict === 'good'
        ? 'The basics are there, a few gaps remain'
        : 'Several important things are missing';

  const parts: string[] = [
    failing.length === 0
      ? `All ${data.evaluatedCount} criteria that could be checked are met.`
      : `${failing.length} of the ${data.evaluatedCount} criteria checked are not met, costing ${lost} points.`,
  ];
  if (failing.length > 0) {
    parts.push(`Every one of them is fixable. Start with ${failing[0].label.toLowerCase()}.`);
  }
  if (unknown.length > 0) {
    parts.push(
      `${unknown.length} more could not be read, so they were left out of the score. Repository admins can see them.`,
    );
  }

  const actions = [...failing]
    .sort((a, b) => b.weight - a.weight)
    .filter((c) => c.fix)
    .map((c) => ({ key: c.id, text: c.fix!, weight: c.weight }));

  return (
    <div className="space-y-5">
      <Verdict
        tone={tone}
        headline={headline}
        summary={parts.join(' ')}
        score={{ value: data.score, caption: `${data.owner}/${data.repo}` }}
      />
      {actions.length > 0 && (
        <Card>
          <div className="p-6">
            <ActionList title="To raise the score" items={actions} />
          </div>
        </Card>
      )}
      {passing.length > 0 && (
        <Card>
          <div className="p-6">
            <SectionTitle>Already in place</SectionTitle>
            <GoodList items={passing.map((c) => c.label)} />
          </div>
        </Card>
      )}
      <Card>
        <div className="p-6">
          <Details summary={`Every criterion (${data.criteria.length})`}>
            <ul className="divide-y divide-[var(--color-line)]">
              {data.criteria.map((c) => {
                const mark = c.status === 'pass' ? '✓' : c.status === 'fail' ? '✕' : '–';
                const t: Tone = c.status === 'pass' ? 'good' : c.status === 'fail' ? 'bad' : 'muted';
                return (
                  <li key={c.id} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                    <span className="flex min-w-0 items-start gap-3">
                      <span className={`w-3 shrink-0 ${toneText(t)}`}>{mark}</span>
                      <span className="min-w-0">{c.label}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-[var(--color-muted)]">
                      {c.detail}
                      {c.status === 'fail' && (
                        <span className="ml-2 text-[var(--color-bad)]">−{c.weight}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Details>
        </div>
      </Card>
    </div>
  );
}

type C = Extract<CommandResult, { id: 'content-audit' }>['data'];

const WHY_MISSING: Record<string, string> = {
  LICENSE: 'Without a license the code cannot legally be reused, so nobody can depend on it.',
  'SECURITY.md':
    'Someone who finds a vulnerability has no private way to reach you, so they will most likely open a public issue instead.',
  'CODE_OF_CONDUCT.md': 'When a discussion turns hostile there is no written rule to fall back on.',
  'CONTRIBUTING.md':
    'Anyone willing to help has no idea where to start, and the changes that arrive come in whatever shape.',
  'README.md': 'The first person to land on the repository cannot tell what it is for.',
};

function ContentAuditView({ data }: { data: C }) {
  const missing = data.items.filter((i) => i.quality === 'missing');
  const weak = data.items.filter((i) => i.quality === 'too_short' || i.quality === 'empty');
  const good = data.items.filter((i) => i.passed);

  const tone: Tone = missing.length === 0 ? (weak.length === 0 ? 'good' : 'warn') : 'bad';
  const headline =
    missing.length === 0 && weak.length === 0
      ? 'Every community standard is in place'
      : missing.length === 0
        ? 'The files exist, but some are barely written'
        : `${missing.length} standard file${missing.length === 1 ? '' : 's'} missing`;

  const summary =
    missing.length === 0 && weak.length === 0
      ? 'Anyone arriving can tell what this project does, how to contribute, and where to report a problem.'
      : [
          `${data.presentCount} of ${data.totalCount} files are present.`,
          missing.length > 0 ? `Missing: ${missing.map((m) => m.file).join(', ')}.` : '',
          weak.length > 0 ? `Too thin: ${weak.map((m) => m.file).join(', ')}.` : '',
        ]
          .filter(Boolean)
          .join(' ');

  const actions = [...missing, ...weak].map((i) => ({
    key: i.file,
    text:
      i.quality === 'missing'
        ? `Add ${i.file} — ${WHY_MISSING[i.file] ?? i.description}`
        : `Flesh out ${i.file} — right now it is ${i.qualityLabel.toLowerCase()}.`,
  }));

  return (
    <div className="space-y-5">
      <Verdict tone={tone} headline={headline} summary={summary} />
      {actions.length > 0 && (
        <Card>
          <div className="p-6">
            <ActionList title="What to do" items={actions} />
          </div>
        </Card>
      )}
      {good.length > 0 && (
        <Card>
          <div className="p-6">
            <SectionTitle>Already in place</SectionTitle>
            <GoodList items={good.map((i) => i.file)} />
          </div>
        </Card>
      )}
      <Card>
        <div className="p-6">
          <Details summary="File by file">
            <ul className="divide-y divide-[var(--color-line)]">
              {data.items.map((item) => {
                const t: Tone =
                  item.quality === 'ok'
                    ? 'good'
                    : item.quality === 'missing'
                      ? 'bad'
                      : item.quality === 'unknown'
                        ? 'muted'
                        : 'warn';
                return (
                  <li
                    key={item.file}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm">{item.file}</p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                        {item.description}
                        {item.foundAt && item.foundAt !== item.file && (
                          <span className="ml-2 font-mono">→ {item.foundAt}</span>
                        )}
                      </p>
                    </div>
                    <Badge tone={t}>{item.qualityLabel}</Badge>
                  </li>
                );
              })}
            </ul>
          </Details>
        </div>
      </Card>
    </div>
  );
}

type CI = Extract<CommandResult, { id: 'contrib-impact' }>['data'];

function ContribImpactView({ data }: { data: CI }) {
  const total = data.contributors.reduce((sum, c) => sum + Math.max(0, c.score), 0);
  const topShare =
    total > 0 && data.contributors.length > 0 ? Math.max(0, data.contributors[0].score) / total : 0;
  const concentrated = topShare > 0.7;

  const tone: Tone = data.contributors.length === 0 ? 'muted' : concentrated ? 'warn' : 'good';
  const headline =
    data.contributors.length === 0
      ? 'No contribution data'
      : concentrated
        ? 'The work sits on one person'
        : 'The work is spread across several people';
  const summary =
    data.contributors.length === 0
      ? 'GitHub returned no contributor statistics for this repository.'
      : concentrated
        ? `About ${Math.round(topShare * 100)}% of the changes were written by ${data.contributors[0].login}. If they step away, there may be nobody left who can keep it going.`
        : `The load is shared between ${data.contributors.length} people. The largest contributor is ${data.contributors[0].login} at ${Math.round(topShare * 100)}%.`;

  return (
    <div className="space-y-5">
      <Verdict tone={tone} headline={headline} summary={summary} />
      <Card>
        <CardHead
          title={`${data.owner}/${data.repo}`}
          subtitle="Score = lines added × 0.7 − lines removed × 0.3. Deleting is contributing too, it just does not weigh as much as writing."
        />
        <div className="p-6">
          {data.statsPending ? (
            <Empty>GitHub is still computing this repository&apos;s statistics. Try again in a few seconds.</Empty>
          ) : data.contributors.length === 0 ? (
            <Empty>No contribution data found.</Empty>
          ) : (
            <ul className="space-y-4">
              {data.contributors.map((c) => {
                const share = total > 0 ? (Math.max(0, c.score) / total) * 100 : 0;
                return (
                  <li key={c.login} className="flex items-center gap-4">
                    {c.avatarUrl && (
                      <img
                        src={c.avatarUrl}
                        alt=""
                        width={32}
                        height={32}
                        className="size-8 rounded-full"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-4 text-sm">
                        <span className="truncate">{c.login}</span>
                        <span className="tabular-nums text-[var(--color-muted)]">
                          {share.toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1">
                        <Bar percent={share} tone={share > 70 ? 'warn' : 'info'} />
                      </div>
                      <p className="mt-1 text-xs text-[var(--color-faint)]">
                        <span className="text-[var(--color-good)]">
                          +{c.additions.toLocaleString(NUM)}
                        </span>{' '}
                        <span className="text-[var(--color-bad)]">
                          −{c.deletions.toLocaleString(NUM)}
                        </span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

type FH = Extract<CommandResult, { id: 'file-history' }>['data'];

function FileHistoryView({ data }: { data: FH }) {
  const commits = data.commits;
  const authors = [...new Set(commits.map((c) => c.author))];
  const last = commits[0];
  const first = commits[commits.length - 1];
  const daysSince = last ? Math.floor((Date.now() - new Date(last.date).getTime()) / 86_400_000) : null;
  const single = authors.length === 1;

  let tone: Tone = 'good';
  let headline: string;
  if (commits.length === 0) {
    tone = 'muted';
    headline = 'No history for this file';
  } else if (daysSince !== null && daysSince > 365) {
    tone = 'warn';
    headline = 'Nobody has touched this file in over a year';
  } else if (single) {
    tone = 'info';
    headline = `Only ${authors[0]} has ever edited this file`;
  } else {
    headline = `${authors.length} people have edited this file`;
  }

  const summary =
    commits.length === 0
      ? 'Either the path is wrong, or the file was never committed under this name.'
      : [
          `${commits.length} commit${commits.length === 1 ? '' : 's'} in view.`,
          `Last change ${relativeTime(last.date)} by ${last.author}.`,
          first && first !== last ? `The oldest in this window is from ${formatDate(first.date)}.` : '',
          single
            ? 'One author means one point of failure: nobody else has context on this file.'
            : '',
        ]
          .filter(Boolean)
          .join(' ');

  return (
    <div className="space-y-5">
      <Verdict tone={tone} headline={headline} summary={summary} />
      <Card>
        <CardHead title={data.path} subtitle={`${data.owner}/${data.repo}`} />
        <div className="px-6 py-5">
          {commits.length === 0 ? (
            <Empty>No commits found for this file.</Empty>
          ) : (
            <Table head={['SHA', 'Date', 'Author', 'Message']}>
              {commits.map((c) => (
                <tr key={c.sha}>
                  <td className="py-2 pr-4 font-mono text-xs">
                    <ExternalLink href={c.url}>{c.sha}</ExternalLink>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-xs text-[var(--color-muted)]">
                    {c.date.slice(0, 10)}
                  </td>
                  <td className="py-2 pr-4 text-xs">{c.author}</td>
                  <td className="py-2 text-xs text-[var(--color-muted)]">{c.message}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

type AA = Extract<CommandResult, { id: 'actions-audit' }>['data'];

const WF_TONE: Record<string, Tone> = {
  critical: 'bad',
  risky: 'bad',
  warning: 'warn',
  info: 'info',
  ok: 'good',
  error: 'muted',
};

const WF_LABEL: Record<string, string> = {
  critical: 'Critical',
  risky: 'Risky',
  warning: 'Warning',
  info: 'Note',
  ok: 'Clean',
  error: 'Unreadable',
};

const WF_RANK: Record<string, number> = {
  critical: 0,
  risky: 1,
  warning: 2,
  info: 3,
  error: 4,
  ok: 5,
};

function ActionsAuditView({ data }: { data: AA }) {
  if (!data.hasWorkflows) {
    return (
      <Card>
        <CardHead title={`${data.owner}/${data.repo}`} />
        <div className="px-6 py-5">
          <Empty>This repository has no GitHub Actions workflows.</Empty>
        </div>
      </Card>
    );
  }

  const findings = data.workflows.flatMap((wf) =>
    wf.findings.map((f) => ({ ...f, workflow: wf.name, path: wf.path })),
  );
  const serious = findings.filter((f) => f.severity === 'critical' || f.severity === 'risky');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const unreadable = data.workflows.filter((wf) => wf.severity === 'error');

  const tone: Tone = serious.length > 0 ? 'bad' : warnings.length > 0 ? 'warn' : 'good';
  const headline =
    serious.length > 0
      ? `${serious.length} workflow risk${serious.length === 1 ? '' : 's'} worth fixing today`
      : warnings.length > 0
        ? 'Nothing critical, but the permissions could be tighter'
        : 'No obvious risk in these workflows';

  const summary = [
    `${data.workflows.length} workflow${data.workflows.length === 1 ? '' : 's'} examined.`,
    serious.length > 0
      ? 'A workflow runs with the repository secrets, so a weakness here reaches everything the token can touch.'
      : warnings.length > 0
        ? 'These will not be exploited on their own, but they widen the blast radius if something else goes wrong.'
        : 'None of the patterns we look for matched. That is not proof the workflows are safe.',
    unreadable.length > 0 ? `${unreadable.length} file could not be read.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const seen = new Set<string>();
  const actions = [...serious, ...warnings]
    .filter((f) => {
      if (seen.has(f.title)) return false;
      seen.add(f.title);
      return true;
    })
    .map((f) => ({ key: f.title, text: `${f.title} — ${f.detail}` }));

  const clean = data.workflows.filter((wf) => wf.severity === 'ok').map((wf) => wf.name);
  const ordered = [...data.workflows].sort(
    (a, b) => (WF_RANK[a.severity] ?? 9) - (WF_RANK[b.severity] ?? 9),
  );

  return (
    <div className="space-y-5">
      <Verdict tone={tone} headline={headline} summary={summary} />

      {actions.length > 0 && (
        <Card>
          <div className="p-6">
            <ActionList title="What to fix" items={actions} />
          </div>
        </Card>
      )}

      {clean.length > 0 && (
        <Card>
          <div className="p-6">
            <SectionTitle>Clean workflows</SectionTitle>
            <GoodList items={clean} />
          </div>
        </Card>
      )}

      <Card>
        <div className="p-6">
          <Details summary={`Workflow by workflow (${data.workflows.length})`}>
            <div className="space-y-5">
              {ordered.map((wf) => (
                <div key={wf.path}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ExternalLink href={wf.url}>
                      <span className="text-sm">{wf.name}</span>
                    </ExternalLink>
                    <Badge tone={WF_TONE[wf.severity]}>{WF_LABEL[wf.severity]}</Badge>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-[var(--color-faint)]">{wf.path}</p>
                  <ul className="mt-2 space-y-2">
                    {wf.findings.map((f, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className={`mt-0.5 shrink-0 text-xs ${toneText(WF_TONE[f.severity])}`}>
                          {f.severity === 'ok' ? '✓' : '!'}
                        </span>
                        <div>
                          <p className="text-sm">{f.title}</p>
                          <p className="mt-0.5 text-xs text-[var(--color-muted)]">{f.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Details>
        </div>
      </Card>
    </div>
  );
}

type CA = Extract<CommandResult, { id: 'commit-anomaly' }>['data'];

function CommitAnomalyView({ data }: { data: CA }) {
  const flagged = data.risky;
  const tone: Tone = flagged.length === 0 ? 'good' : 'warn';
  const headline =
    flagged.length === 0
      ? 'Nothing stood out in these commit messages'
      : `${flagged.length} commit message${flagged.length === 1 ? '' : 's'} worth a look`;
  const summary =
    flagged.length === 0
      ? `${data.scannedCount} commits scanned and none of them carried the words we watch for.`
      : `${flagged.length} of ${data.scannedCount} scanned commits mention things like temporary fixes, debugging or credentials. These are signals, not findings: a commit saying "temp" is usually harmless, but it is worth opening.`;

  return (
    <div className="space-y-5">
      <Verdict tone={tone} headline={headline} summary={summary} />
      <Card>
        <CardHead
          title={`${data.owner}/${data.repo}`}
          subtitle={`${data.scannedCount} commits scanned`}
          right={
            <Badge tone={flagged.length === 0 ? 'good' : 'warn'}>
              {flagged.length === 0 ? 'Nothing flagged' : `${flagged.length} flagged`}
            </Badge>
          }
        />
        <div className="px-6 py-5">
          {flagged.length === 0 ? (
            <Empty>No commit message contained a suspicious word.</Empty>
          ) : (
            <ul className="space-y-4">
              {flagged.map((c) => (
                <li
                  key={c.sha}
                  className={`border-l-2 pl-4 ${
                    c.signals.some((s) => s.level === 'strong')
                      ? 'border-red-800/70'
                      : 'border-[var(--color-line-strong)]'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <ExternalLink href={c.url}>
                      <code className="text-xs">{c.sha}</code>
                    </ExternalLink>
                    <span className="text-sm">{c.message}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    {c.author} · {relativeTime(c.date)}
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-2">
                    {c.signals.map((s, i) => (
                      <li
                        key={i}
                        className={`rounded-full border px-2.5 py-0.5 text-xs ${
                          s.level === 'strong'
                            ? 'border-red-900/60 text-red-300'
                            : 'border-[var(--color-line)] text-[var(--color-muted)]'
                        }`}
                      >
                        {s.label}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

type UA = Extract<CommandResult, { id: 'user-analysis' }>['data'];

function UserAnalysisView({ data }: { data: UA }) {
  const ageDays = Math.floor((Date.now() - new Date(data.createdAt).getTime()) / 86_400_000);
  const years = (ageDays / 365).toFixed(1);
  const starTotal = data.topRepos.reduce((sum, r) => sum + r.stars, 0);
  const empty = data.publicRepos === 0;

  const tone: Tone = empty ? 'muted' : starTotal > 100 || data.followers > 100 ? 'good' : 'info';
  const headline = empty
    ? 'No public work on this account'
    : starTotal > 100 || data.followers > 100
      ? 'An account with a visible track record'
      : 'An ordinary working account';

  const summary = [
    `On GitHub for ${ageDays > 365 ? `${years} years` : `${ageDays} days`}.`,
    empty
      ? 'Nothing public to judge it by.'
      : `${data.publicRepos} public repositories, ${data.followers} followers, and ${starTotal.toLocaleString(NUM)} stars across the top ${data.topRepos.length}.`,
    data.languages.length > 0 ? `Mostly works in ${data.languages[0].name}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-5">
      <Verdict tone={tone} headline={headline} summary={summary} />
      <Card>
        <CardHead
          title={
            <span className="flex items-center gap-3">
              {data.avatarUrl && (
                <img src={data.avatarUrl} alt="" width={32} height={32} className="rounded-full" />
              )}
              <ExternalLink href={data.htmlUrl}>{data.login}</ExternalLink>
            </span>
          }
          subtitle={data.name ?? undefined}
        />
        <div className="space-y-8 px-6 py-5">
          <Stats
            items={[
              { label: 'Followers', value: data.followers.toLocaleString(NUM) },
              { label: 'Following', value: data.following.toLocaleString(NUM) },
              { label: 'Repositories', value: data.publicRepos.toLocaleString(NUM) },
              { label: 'Gists', value: data.publicGists.toLocaleString(NUM) },
            ]}
          />

          {data.topRepos.length > 0 && (
            <div>
              <SectionTitle>Notable repositories</SectionTitle>
              <ul className="space-y-3">
                {data.topRepos.map((r) => (
                  <li key={r.name} className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <ExternalLink href={r.url}>
                        <span className="font-mono text-sm">{r.name}</span>
                      </ExternalLink>
                      {r.description && (
                        <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                          {r.description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-[var(--color-muted)]">
                      ★ {r.stars.toLocaleString(NUM)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.languages.length > 0 && (
            <div>
              <SectionTitle>Languages</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {data.languages.map((l) => (
                  <Badge key={l.name} tone="muted">
                    {l.name} · {l.count}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Details summary="Profile details">
            <KeyValues
              items={[
                {
                  label: 'Joined',
                  value: `${formatDate(data.createdAt)} · ${relativeTime(data.createdAt)}`,
                },
                { label: 'Location', value: data.location ?? '—' },
                { label: 'Company', value: data.company ?? '—' },
                { label: 'Bio', value: data.bio ?? '—' },
              ]}
            />
          </Details>
        </div>
      </Card>
    </div>
  );
}

type UAN = Extract<CommandResult, { id: 'user-anomaly' }>['data'];

function UserAnomalyView({ data }: { data: UAN }) {
  const tone: Tone = data.riskLevel === 'low' ? 'good' : data.riskLevel === 'medium' ? 'warn' : 'bad';
  const caption = data.riskLevel === 'low' ? 'Ordinary' : data.riskLevel === 'medium' ? 'Worth a look' : 'Unusual';
  const maxBlock = Math.max(1, ...data.activityBlocks.map((b) => b.count));
  const warnings = data.anomalies.filter((a) => a.level === 'warning');

  const headline =
    data.riskLevel === 'low'
      ? 'This account behaves like an ordinary one'
      : data.riskLevel === 'medium'
        ? 'A few patterns here are worth checking'
        : 'This account behaves unusually';

  const summary = [
    data.anomalies.length === 0
      ? 'None of the patterns we measure came back unusual.'
      : `${data.anomalies.length} pattern${data.anomalies.length === 1 ? '' : 's'} stood out${warnings.length > 0 ? `, ${warnings.length} of them strongly` : ''}.`,
    'A high score does not mean the account is malicious. It means the behaviour is unusual and worth a look before you trust it.',
  ].join(' ');

  return (
    <div className="space-y-5">
      <Verdict
        tone={tone}
        headline={headline}
        summary={summary}
        score={{ value: data.riskScore, caption: data.login }}
      />

      {data.anomalies.length > 0 && (
        <Card>
          <div className="p-6">
            <SectionTitle>What stood out</SectionTitle>
            <ul className="space-y-2">
              {data.anomalies.map((a, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span
                    className={`mt-0.5 shrink-0 ${toneText(a.level === 'warning' ? 'warn' : 'info')}`}
                  >
                    {a.level === 'warning' ? '!' : 'i'}
                  </span>
                  <span>{a.message}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <Card>
        <CardHead
          title={
            <span className="flex items-center gap-3">
              {data.avatarUrl && (
                <img src={data.avatarUrl} alt="" width={32} height={32} className="rounded-full" />
              )}
              {data.login}
            </span>
          }
          right={<Score value={data.riskScore} tone={tone} caption={caption} />}
        />
        <div className="space-y-8 px-6 py-5">
          <Stats
            items={[
              {
                label: 'Account age',
                value:
                  data.accountAgeDays === null
                    ? '—'
                    : data.accountAgeDays > 365
                      ? `${(data.accountAgeDays / 365).toFixed(1)} yr`
                      : `${data.accountAgeDays} days`,
              },
              { label: 'Repositories', value: `${data.publicRepos}` },
              { label: 'Followers/following', value: `${data.followers}/${data.following}` },
              { label: 'Forks', value: `${data.forkCount}/${data.repoCount}` },
            ]}
          />

          {data.anomalies.length === 0 && <Empty>No unusual pattern was found.</Empty>}

          {data.eventsAnalyzed > 0 && (
            <Details summary={`Activity distribution (${data.eventsAnalyzed} events)`}>
              <ul className="space-y-2.5">
                {data.activityBlocks.map((b) => (
                  <li key={b.label}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-mono text-[var(--color-muted)]">{b.label}</span>
                      <span className="tabular-nums text-[var(--color-muted)]">{b.count}</span>
                    </div>
                    <Bar percent={(b.count / maxBlock) * 100} />
                  </li>
                ))}
              </ul>
            </Details>
          )}
        </div>
      </Card>
    </div>
  );
}

const CONFIDENCE_TONE: Record<string, Tone> = { high: 'bad', medium: 'warn', low: 'muted' };
const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
};

const SECRET_ACTIONS = [
  {
    key: 'rotate',
    text: 'Rotate the key first. Until it is revoked at the provider, it stays valid no matter what you do to the repository.',
  },
  {
    key: 'history',
    text: 'Deleting the file is not enough. The value stays in the commit history, so rewrite it or treat the key as permanently burned.',
  },
  {
    key: 'prevent',
    text: 'Move the value into a secret store or an untracked .env, and add a pre-commit scan so the next one never lands.',
  },
];

function secretVerdict(count: number, highConfidence: number) {
  if (count === 0) {
    return {
      tone: 'good' as Tone,
      headline: 'Nothing found in what was scanned',
      summary:
        'None of the known key patterns matched. This covers only the files that were scanned, so it is not a guarantee the repository is clean.',
    };
  }
  return {
    tone: 'bad' as Tone,
    headline: `${count} possible secret${count === 1 ? '' : 's'} found`,
    summary: `${highConfidence > 0 ? `${highConfidence} of them match a known key format closely.` : 'None matched a known format exactly, so some may be false positives.'} Treat anything real as compromised the moment it was pushed: assume it has already been read.`,
  };
}

type SS = Extract<CommandResult, { id: 'scan-secrets' }>['data'];

function ScanSecretsView({ data }: { data: SS }) {
  const high = data.findings.filter((f) => f.confidence !== 'low').length;
  const v = secretVerdict(data.findings.length, high);

  return (
    <div className="space-y-5">
      <SensitiveNotice>
        This result is not saved and has no shareable address. Values are shown masked and the raw
        key is never stored anywhere. If you find something in someone else&apos;s repository, tell
        the owner rather than publishing it.
      </SensitiveNotice>

      <Verdict tone={v.tone} headline={v.headline} summary={v.summary} />

      {data.findings.length > 0 && (
        <Card>
          <div className="p-6">
            <ActionList title="Do this in order" items={SECRET_ACTIONS} />
          </div>
        </Card>
      )}

      <Card>
        <CardHead
          title={`${data.owner}/${data.repo}`}
          subtitle={`${data.commitsScanned} commits and ${data.filesScanned} files scanned`}
          right={
            <Badge tone={data.findings.length === 0 ? 'good' : 'bad'}>
              {data.findings.length === 0 ? 'Nothing found' : `${data.findings.length} found`}
            </Badge>
          }
        />
        <div className="px-6 py-5">
          {data.findings.length === 0 ? (
            <Empty>No secrets in the scanned commits.</Empty>
          ) : (
            <Table head={['Type', 'Value', 'File', 'Commit', 'Confidence']}>
              {data.findings.map((f, i) => (
                <tr key={i}>
                  <td className="py-2 pr-4 text-xs">{f.type}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-[var(--color-muted)]">{f.masked}</td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {f.file}
                    <span className="text-[var(--color-muted)]">:{f.line}</span>
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    <ExternalLink href={f.commitUrl}>{f.commitSha}</ExternalLink>
                  </td>
                  <td className="py-2 text-xs">
                    <Badge tone={CONFIDENCE_TONE[f.confidence]}>
                      {CONFIDENCE_LABEL[f.confidence]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

type AS = Extract<CommandResult, { id: 'advanced-secrets' }>['data'];

function AdvancedSecretsView({ data }: { data: AS }) {
  const high = data.findings.filter((f) => f.confidence !== 'low').length;
  const v = secretVerdict(data.findings.length, high);

  return (
    <div className="space-y-5">
      <SensitiveNotice>
        This result is not saved and has no shareable address. Values are shown masked and the raw
        key is never stored anywhere. If you find something in someone else&apos;s repository, tell
        the owner rather than publishing it.
      </SensitiveNotice>

      <Verdict tone={v.tone} headline={v.headline} summary={v.summary} />

      {data.findings.length > 0 && (
        <Card>
          <div className="p-6">
            <ActionList title="Do this in order" items={SECRET_ACTIONS} />
          </div>
        </Card>
      )}

      <Card>
        <CardHead
          title={`${data.owner}/${data.repo}`}
          subtitle={`${data.filesScanned} files and ${data.commitsScanned} commits scanned${data.truncatedTree ? ' · the file tree was too large, so it was scanned in part' : ''}`}
          right={
            <Badge tone={data.findings.length === 0 ? 'good' : 'bad'}>
              {data.findings.length === 0 ? 'Nothing found' : `${data.findings.length} found`}
            </Badge>
          }
        />
        <div className="px-6 py-5">
          {data.findings.length === 0 ? (
            <Empty>No secrets in the scanned files and commits.</Empty>
          ) : (
            <Table head={['Type', 'Value', 'Location', 'Source', 'Confidence']}>
              {data.findings.map((f, i) => (
                <tr key={i}>
                  <td className="py-2 pr-4 text-xs">{f.type}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-[var(--color-muted)]">{f.masked}</td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    <ExternalLink href={f.url}>{f.path}</ExternalLink>
                    <span className="text-[var(--color-muted)]">:{f.line}</span>
                  </td>
                  <td className="py-2 pr-4 text-xs text-[var(--color-muted)]">{f.sourceLabel}</td>
                  <td className="py-2 text-xs">
                    <Badge tone={CONFIDENCE_TONE[f.confidence]}>
                      {CONFIDENCE_LABEL[f.confidence]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

const DORK_TONE: Record<string, Tone> = {
  confirmed: 'bad',
  suspicious: 'warn',
  clean: 'good',
  unverified: 'muted',
  unreadable: 'muted',
};

type DS = Extract<CommandResult, { id: 'dork-scan' }>['data'];

function DorkScanView({ data }: { data: DS }) {
  return (
    <div className="space-y-4">
      <SensitiveNotice>
        This result is not saved and has no shareable address. The files below belong to other
        people. If you find something, <strong>tell the owner</strong> — do not publish it and do
        not use it, or the responsibility is yours.
      </SensitiveNotice>
      <Card>
        <CardHead
          title={<span className="font-mono text-xs">{data.query}</span>}
          subtitle={
            data.verified
              ? `${data.totalFound.toLocaleString(NUM)} results · ${data.filteredOut} came back clean and were dropped`
              : `${data.totalFound.toLocaleString(NUM)} results · contents not verified`
          }
        />
        <div className="px-6 py-5">
          {data.hits.length === 0 ? (
            <Empty>{data.verified ? 'None of the results contained a secret.' : 'No results.'}</Empty>
          ) : (
            <ul className="space-y-5">
              {data.hits.map((hit, i) => (
                <li key={i} className="border-l-2 border-[var(--color-line)] pl-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ExternalLink href={hit.url}>
                      <span className="font-mono text-xs">
                        {hit.repo}/{hit.path}
                      </span>
                    </ExternalLink>
                    <Badge tone={DORK_TONE[hit.verdict]}>{hit.verdictLabel}</Badge>
                  </div>
                  {hit.matches.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {hit.matches.map((m, j) => (
                        <li key={j} className="text-xs text-[var(--color-muted)]">
                          {m.type} · <span className="font-mono">{m.masked}</span> · line {m.line}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
