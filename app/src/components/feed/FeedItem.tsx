import { useEffect, useState } from "react";
import { getCommand } from "../../engine";
import {
  itemHref,
  setLike,
  targetHref,
  targetLabel,
  updatePost,
  type FeedItem as Item,
} from "../../lib/feed";
import { parseRepo } from "../../lib/github";
import { memberHref } from "../../lib/people";
import { relativeTime } from "../../engine/shared";
import { RichText } from "../../lib/richText";
import { ScoreRing, type Tone } from "../console/ui";
import { Avatar } from "../profile/ProfileEditor";
import Verified from "../Verified";
import { accentColor, myScansPublic } from "../../lib/profile";
import { SITE_URL } from "../../lib/site";
import Icon from "../Icon";
import ItemMenu from "./ItemMenu";
import { setBookmark } from "../../lib/social";

function scoreTone(score: number | null): Tone {
  if (score === null) return "muted";
  if (score >= 90) return "good";
  if (score >= 75) return "warn";
  return "bad";
}

const ACTION =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-[var(--color-faint)] transition hover:bg-[rgba(163,145,224,0.08)] hover:text-[var(--color-text)]";

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
  const [baseline, setBaseline] = useState({ likes: item.likes, liked });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.body ?? "");
  const [draftRepo, setDraftRepo] = useState(
    item.repo ? `${item.owner}/${item.repo}` : "",
  );

  useEffect(() => {
    setBaseline({ likes: item.likes, liked });
  }, [item.id, item.likes]);

  const href = itemHref(item);
  const label = targetLabel(item);
  const repoHref = targetHref(item);
  const author = memberHref(item.author_login);
  const likes =
    baseline.likes + (liked === baseline.liked ? 0 : liked ? 1 : -1);

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
      setError("A repository is written as owner/repo.");
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

  const [expanded, setExpanded] = useState(false);
  const long = item.kind === "post" && (item.body ?? "").length > 600;
  const [scansPublic, setScansPublic] = useState(true);
  useEffect(() => {
    if (!mine || item.kind !== "report") return;
    let alive = true;
    void myScansPublic().then((open) => {
      if (alive) setScansPublic(open);
    });
    return () => {
      alive = false;
    };
  }, [mine, item.kind]);

  const hiddenScan =
    mine &&
    item.kind === "report" &&
    (item.visibility === "private" ||
      (item.visibility !== "public" && !scansPublic));

  return (
    <article className="feed-row flex gap-3.5 transition hover:bg-[rgba(163,145,224,0.03)] sm:gap-4">
      <span className="feed-avatar shrink-0">
        <Avatar
          src={item.author_avatar}
          name={item.author_login ?? "?"}
          size={38}
          accent={
            item.author_accent ? accentColor(item.author_accent) : undefined
          }
          shape={item.author_shape ?? "circle"}
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="flex min-w-0 items-center gap-1">
              {author ? (
                <a
                  href={author}
                  className="truncate text-sm font-semibold text-[var(--color-text)] hover:underline"
                >
                  {item.author_name ?? item.author_login}
                </a>
              ) : (
                <span className="text-sm font-semibold text-[var(--color-text)]">
                  someone
                </span>
              )}
              {item.author_verified && <Verified size={13} />}
            </span>
            <p className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs text-[var(--color-faint)]">
            {item.author_login && (
              <span className="font-mono">@{item.author_login}</span>
            )}
            {item.kind === "report" && item.report_kind && (
              <span>· ran {getCommand(item.report_kind).name.toLowerCase()}</span>
            )}
            <span>· {relativeTime(item.happened_at)}</span>
            {item.edited_at && <span>· edited</span>}
            {hiddenScan && (
              <span
                title="Your scan history is private. Nobody else sees this was you."
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line-strong)] px-2 py-0.5 text-2xs text-[var(--color-muted)]"
              >
                <Icon name="eye" size={11} />
                Only you
              </span>
            )}
            </p>
          </div>

          <ItemMenu
            item={item}
            href={href}
            mine={mine}
            signedIn={signedIn}
            onEdit={() => setEditing(true)}
            onRemoved={() => onChanged?.()}
            onChanged={() => onChanged?.()}
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
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn btn-quiet px-3 py-1.5 text-xs"
                onClick={() => {
                  setEditing(false);
                  setDraft(item.body ?? "");
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <a href={href} className="mt-1.5 block">
            {item.kind === "post" ? (
              <>
                <span
                  className={`block [overflow-wrap:anywhere] ${
                    long && !expanded ? "max-h-52 overflow-hidden" : ""
                  }`}
                >
                  <RichText body={item.body ?? ""} />
                </span>
                {long && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="mt-1.5 inline-block text-xs font-medium text-[var(--color-link)] hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setExpanded(!expanded);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        setExpanded(!expanded);
                      }
                    }}
                  >
                    {expanded ? "Show less" : "Read more"}
                  </span>
                )}
                {item.quote_id && (
                  <span className="mt-3 block rounded-[var(--radius-control)] border border-[var(--color-line)] px-3.5 py-2.5">
                    <span className="block text-xs text-[var(--color-faint)]">
                      {item.quote_login ?? "someone"}
                    </span>
                    <span className="mt-1 line-clamp-4 [overflow-wrap:anywhere] text-sm text-[var(--color-muted)]">
                      {item.quote_body ?? "This post is gone."}
                    </span>
                  </span>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-mono text-base text-[var(--color-text)]">
                    {label}
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                    {item.report_kind
                      ? getCommand(item.report_kind).name
                      : "Scanned"}
                  </p>
                </div>
                {item.score !== null && (
                  <ScoreRing
                    value={item.score}
                    tone={scoreTone(item.score)}
                    size={54}
                  />
                )}
              </div>
            )}
          </a>
        )}

        {!editing && item.kind === "post" && label && repoHref && (
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
            aria-label={liked ? "Undo like" : "Like"}
            className={`${ACTION} ${liked ? "text-[var(--color-accent)] hover:text-[var(--color-accent)]" : ""}`}
          >
            <Icon name="heart" size={15} filled={liked} />
            {likes > 0 && <span className="tabular-nums">{likes}</span>}
          </button>

          <a href={href} className={ACTION} aria-label="Replies">
            <Icon name="reply" size={15} />
            {item.replies > 0 && (
              <span className="tabular-nums">{item.replies}</span>
            )}
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
              aria-label={saved ? "Remove from saved" : "Save"}
              className={`${ACTION} ${saved ? "text-[var(--color-link)] hover:text-[var(--color-link)]" : ""}`}
            >
              <Icon name="bookmark" size={15} filled={saved} />
            </button>
          )}

          <button
            type="button"
            className={ACTION}
            onClick={() => {
              void navigator.clipboard
                .writeText(`${SITE_URL}${href}`)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                });
            }}
          >
            <Icon name={copied ? "check" : "share"} size={15} />
            {copied && <span>Copied</span>}
          </button>
        </div>

        {error && (
          <p className="mt-1.5 text-xs text-[var(--color-bad)]">{error}</p>
        )}
      </div>
    </article>
  );
}
