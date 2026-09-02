import { useEffect, useState } from 'react';
import { loadFollows, markAllSeen, unfollow, unreadTargets, type FollowActivity } from '../../lib/follows';
import { supabase } from '../../lib/supabase';
import { Card, Score } from '../console/ui';
import { Blank, FeedSkeleton } from '../console/Chrome';
import type { Tone } from '../console/ui';
import { relativeTime } from '../../engine/shared';

function scoreTone(score: number | null): Tone {
  if (score === null) return 'muted';
  if (score >= 90) return 'good';
  if (score >= 75) return 'warn';
  return 'bad';
}

function newsLine(row: FollowActivity): string | null {
  const parts: string[] = [];
  if (row.new_reports > 0) {
    parts.push(`${row.new_reports} new scan${row.new_reports === 1 ? '' : 's'}`);
  }
  if (row.new_comments > 0) {
    parts.push(`${row.new_comments} new comment${row.new_comments === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default function FollowingList() {
  const [rows, setRows] = useState<FollowActivity[] | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setRows(await loadFollows());
  }

  useEffect(() => {
    void (async () => {
      if (!supabase) {
        setSignedIn(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      const has = Boolean(data.session);
      setSignedIn(has);
      if (has) await refresh();
    })();
  }, []);

  if (signedIn === null) return <FeedSkeleton rows={3} />;

  if (!signedIn) {
    return (
      <Blank
        icon="bell"
        title="Following needs an account"
        lead="Follow a repository and this page tells you when someone scans it again or leaves a comment. Scanning itself still works without signing in."
      />
    );
  }

  if (rows === null) return <FeedSkeleton rows={3} />;

  if (rows.length === 0) {
    return (
      <Blank
        icon="bell"
        title="You are not following anything yet"
        lead="Open any repository page and press Follow. Whatever happens there afterwards shows up here."
        action={
          <a href="/app/scan/" className="btn btn-ghost">
            Scan something
          </a>
        }
      />
    );
  }

  const unread = unreadTargets(rows);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-muted)]">
          {unread === 0
            ? `Following ${rows.length}. Nothing new.`
            : `${unread} of ${rows.length} have something new.`}
        </p>
        {unread > 0 && (
          <button
            type="button"
            className="btn btn-quiet"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void markAllSeen()
                .then(refresh)
                .finally(() => setBusy(false));
            }}
          >
            Mark all as read
          </button>
        )}
      </div>

      <ul className="space-y-3">
        {rows.map((row) => {
          const label = row.repo ? `${row.owner}/${row.repo}` : row.owner;
          const href = row.repo ? `/app/r/${row.owner}/${row.repo}/` : `/app/u/${row.owner}/`;
          const news = newsLine(row);
          return (
            <li key={label}>
              <Card>
                <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <a href={href} className="font-mono text-sm hover:underline">
                      {label}
                    </a>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      {row.report_count} report{row.report_count === 1 ? '' : 's'}
                      {row.last_report_at && ` · last scanned ${relativeTime(row.last_report_at)}`}
                    </p>
                    {news && <p className="mt-1 text-xs text-[var(--color-good)]">{news}</p>}
                  </div>

                  {row.score !== null && (
                    <Score value={row.score} tone={scoreTone(row.score)} caption="security" />
                  )}

                  <button
                    type="button"
                    className="btn btn-quiet shrink-0"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void unfollow(row.owner, row.repo)
                        .then(refresh)
                        .finally(() => setBusy(false));
                    }}
                  >
                    Unfollow
                  </button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
