import { useState } from 'react';
import { getCommand } from '../../engine';
import {
  itemHref,
  setLike,
  targetHref,
  targetLabel,
  updatePost,
  type FeedItem as Item,
} from '../../lib/feed';
import { parseRepo } from '../../lib/github';
import { memberHref } from '../../lib/people';
import { relativeTime } from '../../engine/shared';
import { RichText } from '../../lib/richText';
import { ScoreRing, type Tone } from '../console/ui';
import { Avatar } from '../profile/ProfileEditor';
import { SITE_URL } from '../../lib/site';
import Icon from '../Icon';
import ItemMenu from './ItemMenu';
import { setBookmark } from '../../lib/social';

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
  saved = false,
  mine = false,
  signedIn = false,
  onLiked,
  onSaved,
  onQuote,
  onChanged,
}: {
  item: Item;
  liked: boolean;
  saved?: boolean;
  mine?: boolean;
  signedIn?: boolean;
  onLiked: (liked: boolean) => void;
  onSaved?: (saved: boolean) => void;
  onQuote?: (item: Item) => void;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [wasLiked] = useState(liked);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.body ?? '');
  const [draftRepo, setDraftRepo] = useState(item.repo ? `${item.owner}/${item.repo}` : '');

  const href = itemHref(item);
  const label = targetLabel(item);
  const repoHref = targetHref(item);
  const author = memberHref(item.author_login);
  const likes = item.likes + (liked === wasLiked ? 0 : liked ? 1 : -1);

  async function keep() {
    if (busy || !onSaved) return;
    setBusy(true);
    setError(null);
    const problem = await setBookmark(item.kind, item.id, !saved);
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    onSaved(!saved);
  }

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

  async function save() {
    const parsed = draftRepo.trim() ? parseRepo(draftRepo) : null;
    if (draftRepo.trim() && !parsed) {
      setError('A repository is written as owner/repo.');
      return;
    }
    setBusy(true);
    setError(null);
    const problem = await updatePost(item.id, draft, parsed ?? undefined);
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    setEditing(false);
    onChanged?.();
  }

  return (
    <article className="flex gap-3.5 px-5 py-4 transition hover:bg-[rgba(163,145,224,0.03)] sm:gap-4 sm:px-6">
      <Avatar src={item.author_avatar} name={item.author_login ?? '?'} size={38} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs text-[var(--color-faint)]">
            {author ? (
              <a href={author} className="font-medium text-[var(--color-text)] hover:underline">
                {item.author_login}
              </a>
            ) : (
              <span className="font-medium text-[var(--color-text)]">someone</span>
            )}
            {item.kind === 'report' && item.report_kind && (
              <span>ran {getCommand(item.report_kind).name.toLowerCase()}</span>
            )}
            <span>· {relativeTime(item.happened_at)}</span>
            {item.edited_at && <span>· edited</span>}
          </p>

          <ItemMenu
            item={item}
            href={href}
            mine={mine}
            signedIn={signedIn}
            onEdit={() => setEditing(true)}
            onRemoved={() => onChanged?.()}
          />
        </div>

        {editing ? (
          <div className="mt-2 space-y-2">
            <textarea
              className="field resize-y"
              rows={4}
              maxLength={4000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <input
              className="field font-mono text-xs"
              value={draftRepo}
              placeholder="owner/repo"
              spellCheck={false}
              onChange={(e) => setDraftRepo(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary px-4 py-1.5 text-xs"
                disabled={busy || !draft.trim()}
                onClick={() => void save()}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn-quiet px-3 py-1.5 text-xs"
                onClick={() => {
                  setEditing(false);
                  setDraft(item.body ?? '');
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <a href={href} className="mt-1.5 block">
            {item.kind === 'post' ? (
              <>
                <RichText body={item.body ?? ''} />
                {item.quote_id && (
                  <span className="mt-3 block rounded-[var(--radius-control)] border border-[var(--color-line)] px-3.5 py-2.5">
                    <span className="block text-xs text-[var(--color-faint)]">
                      {item.quote_login ?? 'someone'}
                    </span>
                    <span className="mt-1 block line-clamp-4 text-sm text-[var(--color-muted)]">
                      {item.quote_body ?? 'This post is gone.'}
                    </span>
                  </span>
                )}
              </>
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
        )}

        {!editing && item.kind === 'post' && label && repoHref && (
          <a
            href={repoHref}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-2.5 py-0.5 font-mono text-xs text-[var(--color-muted)] transition hover:border-[var(--color-line-active)]"
          >
            <Icon name="repo" size={12} />
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

          {onQuote && (
            <button
              type="button"
              className={ACTION}
              aria-label="Quote"
              onClick={() => onQuote(item)}
            >
              <Icon name="quote" size={15} />
            </button>
          )}

          {onSaved && (
            <button
              type="button"
              onClick={() => void keep()}
              disabled={busy}
              aria-pressed={saved}
              aria-label={saved ? 'Remove from saved' : 'Save'}
              className={`${ACTION} ${saved ? 'text-[var(--color-link)] hover:text-[var(--color-link)]' : ''}`}
            >
              <Icon name="bookmark" size={15} filled={saved} />
            </button>
          )}

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
