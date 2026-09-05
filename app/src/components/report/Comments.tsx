import { useEffect, useState } from "react";
import {
  loadComments,
  loadMyVotes,
  postComment,
  editableUntil,
  setCommentPin,
  softDeleteComment,
  updateComment,
  voteComment,
  type Comment,
  type CommentTarget,
  type VoteValue,
} from "../../lib/comments";
import { supabase } from "../../lib/supabase";
import { Card, Empty } from "../console/ui";
import Icon from "../Icon";
import Verified from "../Verified";
import { RichText } from "../../lib/richText";
import { memberHref } from "../../lib/people";
import { shownName } from "../../lib/profile";
import { cachedProfile } from "../../lib/profile";
import { amIModerator, removeAsModerator } from "../../lib/moderation";
import { markSeenForTarget } from "../../lib/notifications";
import { relativeTime } from "../../engine/shared";
import ReportButton from "../ReportButton";

export default function Comments({
  target,
  ownerLogin,
}: {
  target: CommentTarget;
  ownerLogin?: string | null;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [myVotes, setMyVotes] = useState<Map<string, VoteValue>>(new Map());
  const [me, setMe] = useState<string | null>(null);
  const [myLogin, setMyLogin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyPrefill, setReplyPrefill] = useState("");
  const [openThreads, setOpenThreads] = useState<Set<string>>(new Set());

  function askReply(rootId: string, mention?: string) {
    const already = replyTo === rootId && replyPrefill === (mention ? `@${mention} ` : "");
    setReplyTo(already ? null : rootId);
    setReplyPrefill(mention ? `@${mention} ` : "");
  }
  async function refresh() {
    const list = await loadComments(target);
    setComments(list);
    setMyVotes(await loadMyVotes(list.map((c) => c.id)));
  }
  useEffect(() => {
    let alive = true;
    setMyLogin(cachedProfile()?.gh_login ?? null);

    void (async () => {
      await refresh();
      if (alive) setLoading(false);
    })();

    if (!supabase) return;

    function settle(userId: string | null) {
      if (!alive) return;
      setMe(userId);
      if (!userId) return;
      void refresh();
      void markSeenForTarget(target).then((cleared) => {
        if (cleared) window.dispatchEvent(new CustomEvent("exc:seen"));
      });
    }

    const { data: watcher } = supabase.auth.onAuthStateChange((_event, session) => {
      settle(session?.user.id ?? null);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) settle(data.session.user.id);
    });

    return () => {
      alive = false;
      watcher.subscription.unsubscribe();
    };
  }, [target.kind, target.id]);
  const repliesOf = (id: string) =>
    comments.filter((c) => c.parent_id === id && c.deleted_at === null);
  const roots = comments
    .filter((c) => !c.parent_id && (c.deleted_at === null || repliesOf(c.id).length > 0))
    .sort((a, b) => {
      const pinned = (b.pinned_at ? 1 : 0) - (a.pinned_at ? 1 : 0);
      if (pinned !== 0) return pinned;
      if (b.vote_score !== a.vote_score) return b.vote_score - a.vote_score;
      return a.created_at.localeCompare(b.created_at);
    });
  const iOwnThis = Boolean(ownerLogin) && myLogin === ownerLogin;
  const visible = roots.length + roots.reduce((n, c) => n + repliesOf(c.id).length, 0);
  return (
    <Card>
      <div className="space-y-6 px-6 py-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold">Discussion</h2>
          <span className="text-xs text-[var(--color-muted)]">
            {visible === 0
              ? "no comments yet"
              : `${visible} comment${visible === 1 ? "" : "s"}`}
          </span>
        </div>
        {me ? (
          <Composer
            target={target}
            parentId={null}
            onPosted={() => void refresh()}
            placeholder="What do you make of this report? Markdown works, and @names and owner/repo become links."
          />
        ) : (
          <p className="rounded-lg border border-[var(--color-line)] px-4 py-3 text-xs text-[var(--color-muted)]">
            <a href="/app/" className="text-sky-400 hover:underline">
              Sign in with GitHub
            </a>{" "}
            to join the discussion.
          </p>
        )}
        {loading ? (
          <p className="text-sm text-[var(--color-muted)]">Loading…</p>
        ) : roots.length === 0 ? (
          <Empty>Nothing said yet. Start it off.</Empty>
        ) : (
          <ul className="space-y-6">
            {roots.map((c) => (
              <li key={c.id}>
                <CommentRow
                  comment={c}
                  me={me}
                  myVote={myVotes.get(c.id) ?? 0}
                  ownerLogin={ownerLogin}
                  canPin={iOwnThis}
                  onChanged={() => void refresh()}
                  onReply={() => askReply(c.id)}
                />
                {(() => {
                  const thread = repliesOf(c.id);
                  if (thread.length === 0) return null;
                  const opened = openThreads.has(c.id);
                  const onScreen = opened ? thread : thread.slice(0, 1);
                  return (
                    <>
                      <ul className="mt-4 space-y-4 border-l border-[var(--color-line)] pl-5">
                        {onScreen.map((r) => (
                          <li key={r.id}>
                            <CommentRow
                              comment={r}
                              me={me}
                              myVote={myVotes.get(r.id) ?? 0}
                              ownerLogin={ownerLogin}
                              onChanged={() => void refresh()}
                              onReply={() =>
                                askReply(c.id, r.author?.gh_login ?? undefined)
                              }
                            />
                          </li>
                        ))}
                      </ul>
                      {thread.length > 1 && (
                        <button
                          type="button"
                          className="mt-3 ml-5 text-xs font-medium text-[var(--color-link)] hover:underline"
                          onClick={() =>
                            setOpenThreads((prev) => {
                              const next = new Set(prev);
                              if (opened) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            })
                          }
                        >
                          {opened
                            ? "Show fewer replies"
                            : `Show all ${thread.length} replies`}
                        </button>
                      )}
                    </>
                  );
                })()}
                {replyTo === c.id && me && (
                  <div className="mt-4 border-l border-[var(--color-line)] pl-5">
                    <Composer
                      key={`${c.id}:${replyPrefill}`}
                      target={target}
                      parentId={c.id}
                      prefill={replyPrefill}
                      placeholder="Your reply…"
                      onPosted={() => {
                        setReplyTo(null);
                        setReplyPrefill("");
                        void refresh();
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
function CommentRow({
  comment,
  me,
  myVote,
  ownerLogin,
  canPin = false,
  onChanged,
  onReply,
}: {
  comment: Comment;
  me: string | null;
  myVote: VoteValue;
  ownerLogin?: string | null;
  canPin?: boolean;
  onChanged: () => void;
  onReply?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [ownVote, setOwnVote] = useState<VoteValue | null>(null);
  const [ownScore, setOwnScore] = useState<number | null>(null);
  const [pinning, setPinning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [problem, setProblem] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const long = comment.body.length > 600;
  const removed = comment.deleted_at !== null;
  const login = comment.author?.gh_login ?? "someone";
  const author = comment.author
    ? shownName({
        name_source: comment.author.name_source,
        display_name: comment.author.display_name,
        gh_name: comment.author.gh_name,
        gh_login: comment.author.gh_login,
      })
    : "someone";
  const mine = me === comment.author_id;
  const stillOpen = Date.now() < editableUntil(comment);
  const [moderator, setModerator] = useState(false);

  useEffect(() => {
    if (!me || mine) return;
    void amIModerator().then(setModerator);
  }, [me, mine]);

  async function removeIt() {
    setBusy(true);
    setProblem(null);
    const trouble = await removeAsModerator("comment", comment.id);
    setBusy(false);
    if (trouble) {
      setProblem(trouble);
      return;
    }
    onChanged();
  }

  async function saveEdit() {
    setBusy(true);
    setProblem(null);
    const trouble = await updateComment(comment.id, draft);
    setBusy(false);
    if (trouble) {
      setProblem(trouble);
      return;
    }
    setEditing(false);
    onChanged();
  }
  useEffect(() => {
    setOwnVote(null);
    setOwnScore(null);
  }, [comment.id, comment.vote_score, myVote]);

  const vote = ownVote ?? myVote;
  const score = ownScore ?? comment.vote_score;
  const byOwner = Boolean(ownerLogin) && login === ownerLogin;

  async function cast(next: VoteValue) {
    if (!me || busy) return;
    const wanted: VoteValue = vote === next ? 0 : next;
    const before = { vote, score };
    setOwnVote(wanted);
    setOwnScore(score + (wanted - vote));
    setBusy(true);
    setProblem(null);
    const trouble = await voteComment(comment.id, wanted);
    setBusy(false);
    if (trouble) {
      setOwnVote(before.vote);
      setOwnScore(before.score);
      setProblem(trouble);
    }
  }

  async function togglePin() {
    setPinning(true);
    const trouble = await setCommentPin(comment.id, comment.pinned_at === null);
    setPinning(false);
    if (trouble) {
      setProblem(trouble);
      return;
    }
    onChanged();
  }
  return (
    <article className="flex gap-3">
      <div className="shrink-0 pt-0.5">
        <button
          type="button"
          onClick={() => void cast(1)}
          disabled={!me || removed}
          aria-label={vote === 1 ? "Helpful, press to undo" : "Mark as helpful"}
          aria-pressed={vote === 1}
          title={vote === 1 ? "You found this helpful" : "Found this helpful?"}
          className={`flex w-9 flex-col items-center gap-0.5 rounded-[var(--radius-control)] py-1 transition ${
            vote === 1
              ? "bg-[color-mix(in_srgb,var(--color-good)_14%,transparent)] text-[var(--color-good)]"
              : "text-[var(--color-muted)] hover:bg-[rgba(163,145,224,0.08)] hover:text-[var(--color-text)]"
          } disabled:pointer-events-none disabled:opacity-40`}
        >
          <Icon name="up" size={14} />
          <span className="text-xs tabular-nums leading-none">{score}</span>
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--color-muted)]">
          {comment.author?.avatar_url && (
            <img
              src={comment.author.avatar_url}
              alt=""
              width={18}
              height={18}
              className="rounded-full"
            />
          )}
          <a
            href={memberHref(login) ?? "#"}
            className="inline-flex items-center gap-1 font-medium text-[var(--color-text)] hover:underline"
          >
            {author}
            {comment.author?.verified && <Verified size={12} />}
          </a>
          {byOwner && (
            <span
              title="Wrote the thing this is about"
              className="rounded-full border border-[var(--color-line-strong)] px-1.5 text-2xs font-medium text-[var(--color-muted)]"
            >
              author
            </span>
          )}
          {comment.pinned_at && (
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-[var(--color-link)]">
              <Icon name="pin" size={11} />
              Pinned
            </span>
          )}
          <span>{relativeTime(comment.created_at)}</span>
          {comment.updated_at !== comment.created_at && !removed && (
            <span>· edited</span>
          )}
        </div>
        {removed ? (
          <p className="mt-1.5 text-sm italic text-[var(--color-muted)]">
            This comment was deleted.
          </p>
        ) : editing ? (
          <div className="mt-2 space-y-2">
            <textarea
              className="field resize-y"
              rows={3}
              maxLength={4000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || draft.trim().length === 0}
                onClick={() => void saveEdit()}
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  setDraft(comment.body);
                  setProblem(null);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
              <span className="text-2xs text-[var(--color-faint)]">
                Editing closes 15 minutes after posting.
              </span>
            </div>
            {problem && <p className="text-xs text-[var(--color-bad)]">{problem}</p>}
          </div>
        ) : (
          <div className="mt-1.5 text-sm">
            <div className={long && !expanded ? "max-h-44 overflow-hidden" : undefined}>
              <RichText body={comment.body} />
            </div>
            {long && (
              <button
                type="button"
                className="mt-1.5 text-xs font-medium text-[var(--color-link)] hover:underline"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            )}
          </div>
        )}
        {!removed && (
          <div className="mt-2 flex gap-4 text-xs text-[var(--color-muted)]">
            {onReply && me && (
              <button
                type="button"
                onClick={onReply}
                className="hover:text-[var(--color-text)]"
              >
                Reply
              </button>
            )}
            {canPin && (
              <button
                type="button"
                disabled={pinning}
                onClick={() => void togglePin()}
                className="hover:text-[var(--color-text)]"
              >
                {comment.pinned_at ? "Unpin" : "Pin"}
              </button>
            )}
            {mine ? (
              <>
                {stillOpen && !editing && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="hover:text-[var(--color-text)]"
                  >
                    Edit
                  </button>
                )}
                {asking ? (
                  <>
                    <span className="text-[var(--color-muted)]">Delete it?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAsking(false);
                        void softDeleteComment(comment.id).then((done) => {
                          if (!done) {
                            setProblem("That did not delete. Try again.");
                            return;
                          }
                          onChanged();
                        });
                      }}
                      className="text-[var(--color-bad)] hover:underline"
                    >
                      Yes, delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setAsking(false)}
                      className="hover:text-[var(--color-text)]"
                    >
                      Keep it
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAsking(true)}
                    className="hover:text-[var(--color-bad)]"
                  >
                    Delete
                  </button>
                )}
              </>
            ) : (
              me && (
                <>
                  <ReportButton targetType="comment" targetId={comment.id} />
                  {moderator && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeIt()}
                      className="hover:text-[var(--color-bad)]"
                    >
                      Take it down
                    </button>
                  )}
                </>
              )
            )}
          </div>
        )}
        {problem && !editing && (
          <p className="mt-2 text-xs text-[var(--color-bad)]">{problem}</p>
        )}
      </div>
    </article>
  );
}
function Composer({
  target,
  parentId,
  placeholder,
  prefill = "",
  onPosted,
}: {
  target: CommentTarget;
  parentId: string | null;
  placeholder: string;
  prefill?: string;
  onPosted: () => void;
}) {
  const [body, setBody] = useState(prefill);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    const { error } = await postComment(target, body, parentId);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    setBody("");
    onPosted();
  }
  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={4000}
        className="field resize-y"
      />
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!body.trim() || busy}
          className="btn btn-primary btn-sm"
        >
          {busy ? "Sending…" : "Send"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
