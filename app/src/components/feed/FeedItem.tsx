import { useState } from 'react';
import { getCommand } from '../../engine';
import { itemHref, setLike, targetHref, targetLabel, type FeedItem as Item } from '../../lib/feed';
import { relativeTime } from '../../engine/shared';
import { ScoreRing, type Tone } from '../console/ui';
import { Avatar } from '../profile/ProfileEditor';
import { SITE_URL } from '../../lib/site';

function scoreTone(score: number | null): Tone {
  if (score === null) return 'muted';
  if (score >= 90) return 'good';
  if (score >= 75) return 'warn';
  return 'bad';
}

export default function FeedItem({
  item,
  liked,
  onLiked,
}: {
  item: Item;
  liked: boolean;
  onLiked: (liked: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [wasLiked] = useState(liked);

  const href = itemHref(item);
  const label = targetLabel(item);
  const repoHref = targetHref(item);
  const likes = item.likes + (liked === wasLiked ? 0 : liked ? 1 : -1);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const problem = await setLike(item, !liked);
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    onLiked(!liked);
  }

  return (
    <article className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-lift)]">
      <div className="flex items-center gap-3 px-5 pt-4">
        <Avatar src={item.author_avatar} name={item.author_login ?? '?'} size={30} />
        <p className="min-w-0 flex-1 truncate text-xs text-[var(--color-muted)]">
          <span className="font-medium text-[var(--color-text)]">
            {item.author_login ?? 'someone'}
          </span>
          {item.kind === 'report' && item.report_kind && (
            <> ran {getCommand(item.report_kind).name.toLowerCase()}</>
          )}
          <> · {relativeTime(item.happened_at)}</>
        </p>
      </div>

      <a href={href} className="block px-5 py-3.5">
        {item.kind === 'post' ? (
          <>
            <p className="whitespace-pre-wrap text-base text-[var(--color-text)]">{item.body}</p>
            {label && (
              <span className="mt-3 inline-flex rounded-full border border-[var(--color-line)] px-2.5 py-0.5 font-mono text-xs text-[var(--color-muted)]">
                {label}
              </span>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between gap-5">
            <div className="min-w-0">
              <p className="truncate font-mono text-lg text-[var(--color-text)]">{label}</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {item.report_kind ? getCommand(item.report_kind).name : 'Scanned'}
              </p>
            </div>
            {item.score !== null && (
              <ScoreRing value={item.score} tone={scoreTone(item.score)} size={62} />
            )}
          </div>
        )}
      </a>

      <div className="flex flex-wrap items-center gap-1 border-t border-[var(--color-line)] px-3 py-2 text-xs">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          aria-pressed={liked}
          className={`rounded-[var(--radius-control)] px-3 py-1.5 transition hover:bg-[rgba(163,145,224,0.08)] ${
            liked ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'
          }`}
        >
          {liked ? '♥' : '♡'} {likes > 0 ? likes : ''}
        </button>

        <a
          href={href}
          className="rounded-[var(--radius-control)] px-3 py-1.5 text-[var(--color-muted)] transition hover:bg-[rgba(163,145,224,0.08)] hover:text-[var(--color-text)]"
        >
          ○ {item.replies > 0 ? item.replies : 'Reply'}
        </a>

        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(`${SITE_URL}${href}`).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
          className="rounded-[var(--radius-control)] px-3 py-1.5 text-[var(--color-muted)] transition hover:bg-[rgba(163,145,224,0.08)] hover:text-[var(--color-text)]"
        >
          {copied ? 'Link copied' : '↗ Share'}
        </button>

        {repoHref && (
          <a
            href={repoHref}
            className="ml-auto rounded-[var(--radius-control)] px-3 py-1.5 font-mono text-xs text-[var(--color-faint)] transition hover:text-[var(--color-text)]"
          >
            {label}
          </a>
        )}
      </div>

      {error && <p className="px-5 pb-3 text-xs text-[var(--color-bad)]">{error}</p>}
    </article>
  );
}
