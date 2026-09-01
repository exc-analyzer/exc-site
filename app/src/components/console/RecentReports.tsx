import { useEffect, useState } from 'react';
import { getCommand } from '../../engine';
import { loadRecentReports, type StoredReport } from '../../lib/reports';
import { relativeTime } from '../../engine/shared';
import { Badge, Card, Empty, type Tone } from './ui';

const VISIBLE_LIMIT = 12;
export default function RecentReports() {
  const [reports, setReports] = useState<StoredReport[] | null>(null);
  useEffect(() => {
    void loadRecentReports(VISIBLE_LIMIT).then(setReports);
  }, []);
  return (
    <Card className="flex h-full max-h-[22rem] flex-col">
      <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-line)] px-5 py-3.5">
        <h2 className="text-sm font-semibold">Recently scanned</h2>
        {reports && reports.length > 0 && (
          <span className="text-xs text-[var(--color-faint)]">{reports.length}</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        {reports === null ? (
          <p className="py-4 text-sm text-[var(--color-muted)]">Loading…</p>
        ) : reports.length === 0 ? (
          <div className="py-4">
            <Empty>Nobody has scanned anything yet. Be the first.</Empty>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {reports.map((r) => {
              const href = r.repo ? `/app/r/${r.owner}/${r.repo}/` : `/app/u/${r.owner}/`;
              const label = r.repo ? `${r.owner}/${r.repo}` : r.owner;
              const tone: Tone =
                r.score === null ? 'muted' : r.score >= 90 ? 'good' : r.score >= 75 ? 'warn' : 'bad';
              return (
                <li key={r.id}>
                  <a
                    href={href}
                    className="group flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs group-hover:text-[var(--color-secondary)]">
                        {label}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-[var(--color-faint)]">
                        {getCommand(r.kind).name} · {relativeTime(r.updated_at)}
                      </span>
                    </span>
                    {r.score !== null && <Badge tone={tone}>{r.score}</Badge>}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}