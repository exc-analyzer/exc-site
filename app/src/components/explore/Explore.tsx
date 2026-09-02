import { useEffect, useState } from 'react';
import {
  bestDefended,
  mostDiscussed,
  mostImproved,
  mostScanned,
  repoHref,
  type ExploreRow,
} from '../../lib/explore';
import { relativeTime } from '../../engine/shared';
import { ScoreRing, SectionTitle, type Tone } from '../console/ui';
import { Blank, BlockSkeleton } from '../console/Chrome';
import Icon, { type IconName } from '../Icon';

function scoreTone(score: number | null): Tone {
  if (score === null) return 'muted';
  if (score >= 90) return 'good';
  if (score >= 75) return 'warn';
  return 'bad';
}

interface List {
  key: string;
  icon: IconName;
  title: string;
  lead: string;
  load: () => Promise<ExploreRow[]>;
  detail: (row: ExploreRow) => string;
  ring: boolean;
}

const LISTS: List[] = [
  {
    key: 'improved',
    icon: 'up',
    title: 'Climbing',
    lead: 'Repositories whose security score has gone up since someone first looked.',
    load: mostImproved,
    detail: (r) => `${r.first_score} to ${r.score}, up ${r.improvement}`,
    ring: true,
  },
  {
    key: 'best',
    icon: 'shield',
    title: 'Best defended',
    lead: 'The highest security scores anyone has recorded here.',
    load: bestDefended,
    detail: (r) => `scanned ${r.scan_count} time${r.scan_count === 1 ? '' : 's'}`,
    ring: true,
  },
  {
    key: 'scanned',
    icon: 'search',
    title: 'Looked at most',
    lead: 'What people keep coming back to check.',
    load: mostScanned,
    detail: (r) => `${r.scan_count} scan${r.scan_count === 1 ? '' : 's'} · ${relativeTime(r.updated_at)}`,
    ring: false,
  },
  {
    key: 'discussed',
    icon: 'reply',
    title: 'Being argued about',
    lead: 'Where the conversation is.',
    load: mostDiscussed,
    detail: (r) => `${r.replies} repl${r.replies === 1 ? 'y' : 'ies'}`,
    ring: false,
  },
];

export default function Explore() {
  const [data, setData] = useState<Record<string, ExploreRow[]> | null>(null);

  useEffect(() => {
    void (async () => {
      const results = await Promise.all(LISTS.map((l) => l.load()));
      setData(Object.fromEntries(LISTS.map((l, i) => [l.key, results[i]])));
    })();
  }, []);

  if (data === null) {
    return (
      <div className="space-y-8">
        <BlockSkeleton height="h-56" />
        <BlockSkeleton height="h-56" />
      </div>
    );
  }

  const anything = Object.values(data).some((rows) => rows.length > 0);
  if (!anything) {
    return (
      <Blank
        icon="compass"
        title="Nothing to rank yet"
        lead="These lists fill up as people scan. Run the first one and it appears here."
        action={
          <a href="/app/scan/" className="btn btn-primary">
            Scan a repository
          </a>
        }
      />
    );
  }

  return (
    <div className="space-y-9">
      {LISTS.map((list) => {
        const rows = data[list.key] ?? [];
        if (rows.length === 0) return null;
        return (
          <section key={list.key}>
            <SectionTitle>{list.title}</SectionTitle>
            <p className="-mt-2 mb-4 text-sm text-[var(--color-muted)]">{list.lead}</p>

            <ol className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
              {rows.map((row, i) => (
                <li key={`${row.owner}/${row.repo}/${row.kind}`}>
                  <a
                    href={repoHref(row)}
                    className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-[rgba(163,145,224,0.04)]"
                  >
                    <span className="w-4 shrink-0 text-right text-xs tabular-nums text-[var(--color-faint)]">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-sm text-[var(--color-text)]">
                        {row.owner}/{row.repo}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                        <Icon name={list.icon} size={12} />
                        {list.detail(row)}
                      </span>
                    </span>
                    {list.ring && row.score !== null && (
                      <ScoreRing value={row.score} tone={scoreTone(row.score)} size={44} />
                    )}
                  </a>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
