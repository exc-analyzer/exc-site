import { useEffect, useState } from 'react';
import { getCommand } from '../../engine';
import { loadRecentReports, reportPath, type StoredReport } from '../../lib/reports';
import { relativeTime } from '../../engine/shared';
import { Badge, Card, Empty, type Tone } from './ui';

/**
 * Son taranan raporlar.
 *
 * Bu liste olmadan hiç kimse başkasının raporunu göremez ve topluluk
 * görünmez kalır. Akış, tarama ile tartışma arasındaki köprü.
 */
export default function RecentReports() {
  const [reports, setReports] = useState<StoredReport[] | null>(null);

  useEffect(() => {
    void loadRecentReports(20).then(setReports);
  }, []);

  if (reports === null) {
    return (
      <Card>
        <div className="px-6 py-5 text-sm text-[var(--color-muted)]">Yükleniyor…</div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="px-6 py-5">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold">Son taranan</h2>
          <span className="text-xs text-[var(--color-muted)]">
            {reports.length === 0 ? 'henüz kayıt yok' : `${reports.length} rapor`}
          </span>
        </div>

        {reports.length === 0 ? (
          <Empty>Henüz kimse tarama yapmamış. İlk sen ol.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {reports.map((r) => {
              const href = reportPath(r.owner, r.repo, r.kind);
              const label = r.repo ? `${r.owner}/${r.repo}` : r.owner;
              const scanner = r.profiles?.gh_login;
              const tone: Tone =
                r.score === null ? 'muted' : r.score >= 90 ? 'good' : r.score >= 75 ? 'warn' : 'bad';

              return (
                <li key={r.id} className="py-2.5">
                  <a href={href ?? '#'} className="group flex items-center justify-between gap-4">
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-sm group-hover:text-sky-400">
                        {label}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                        {getCommand(r.kind).name}
                        {scanner && ` · ${scanner}`} · {relativeTime(r.updated_at)}
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
