import { useState } from 'react';
import { getCommand } from '../../engine';
import { itemHref, setLike, targetHref, targetLabel, type FeedItem as Item } from '../../lib/feed';
import { relativeTime } from '../../engine/shared';
import { ScoreRing, type Tone } from '../console/ui';
import { Avatar } from '../profile/ProfileEditor';
import { SITE_URL } from '../../lib/site';
import Icon from '../Icon';
import { RichText } from '../../lib/richText';

function scoreTone(score: number | null): Tone {
  if (score === null) return 'muted';
  if (score >= 90) return 'good';
  if (score >= 75) return 'warn';
  return 'bad';
}

const ACTION =
  'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-[var(--color-faint)] transition hover:bg-[rgba(163,145,224,0.08)] hover:text-[var(--color-text)]';

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
    <article className="flex gap-3.5 px-5 py-4 transition hover:bg-[rgba(163,145,224,0.03)] sm:gap-4 sm:px-6">
      <Avatar src={item.author_avatar} name={item.author_login ?? '?'} size={38} />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-[var(--color-faint)]">
          <span className="font-medium text-[var(--color-text)]">
            {item.author_login ?? 'someone'}
          </span>
          {item.kind === 'report' && item.report_kind && (
            <span>ran {getCommand(item.report_kind).name.toLowerCase()}</span>
          )}
          <span>· {relativeTime(item.happened_at)}</span>
        </p>

        <a href={href} className="mt-1.5 block">
          {item.kind === 'post' ? (
            <RichText body={item.body ?? ''} />
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate font-mono text-base text-[var(--color-text)]">{label}</p>
                <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                  {item.report_kind ? getCommand(item.report_kind).name : 'Scanned'}
                </p>
              </div>
              {item.score !== null && (
                <ScoreRing value={item.score} tone={scoreTone(item.score)} size={54} />
              )}
            </div>
          )}
        </a>

        {item.kind === 'post' && label && repoHref && (
          <a
            href={repoHref}
            className="mt-2.5 inline-flex rounded-full border border-[var(--color-line)] px-2.5 py-0.5 font-mono text-xs text-[var(--color-muted)] transition hover:border-[var(--color-line-active)]"
          >
            {label}
          </a>
        )}

        <div className="-ml-2 mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={busy}
            aria-pressed={liked}
            aria-label={liked ? 'Undo like' : 'Like'}
            className={`${ACTION} ${liked ? 'text-[var(--color-accent)] hover:text-[var(--color-accent)]' : ''}`}
          >
            <Icon name="heart" size={15} filled={liked} />
            {likes > 0 && <span className="tabular-nums">{likes}</span>}
          </button>

          <a href={href} className={ACTION} aria-label="Replies">
            <Icon name="reply" size={15} />
            {item.replies > 0 && <span className="tabular-nums">{item.replies}</span>}
          </a>

          <button
            type="button"
            className={ACTION}
            onClick={() => {
              void navigator.clipboard.writeText(`${SITE_URL}${href}`).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              });
            }}
          >
            <Icon name={copied ? 'check' : 'share'} size={15} />
            {copied && <span>Copied</span>}
          </button>
        </div>

        {error && <p className="mt-1.5 text-xs text-[var(--color-bad)]">{error}</p>}
      </div>
    </article>
  );
}
