import { useEffect, useState } from 'react';
import {
  loadComments,
  loadMyVotes,
  postComment,
  softDeleteComment,
  voteComment,
  type Comment,
  type CommentTarget,
  type VoteValue,
} from '../../lib/comments';
import { supabase } from '../../lib/supabase';
import { Card, Empty, ExternalLink } from '../console/ui';
import { relativeTime } from '../../engine/shared';
import ReportButton from '../ReportButton';

export default function Comments({ target }: { target: CommentTarget }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [myVotes, setMyVotes] = useState<Map<string, VoteValue>>(new Map());
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  async function refresh() {
    const list = await loadComments(target);
    setComments(list);
    setMyVotes(await loadMyVotes(list.map((c) => c.id)));
  }
  useEffect(() => {
    void (async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        setMe(data.session?.user.id ?? null);
      }
      await refresh();
      setLoading(false);
    })();
  }, [target.kind, target.id]);
  const roots = comments.filter((c) => !c.parent_id);
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id);
  return (
    <Card>
      <div className="space-y-6 px-6 py-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold">Discussion</h2>
          <span className="text-xs text-[var(--color-muted)]">
            {comments.length === 0
              ? 'no comments yet'
              : `${comments.length} comment${comments.length === 1 ? '' : 's'}`}
          </span>
        </div>
        {me ? (
          <Composer
            target={target}
            parentId={null}
            onPosted={() => void refresh()}
            placeholder="What do you make of this report?"
          />
        ) : (
          <p className="rounded-lg border border-[var(--color-line)] px-4 py-3 text-xs text-[var(--color-muted)]">
            <a href="/app/" className="text-sky-400 hover:underline">
              Sign in with GitHub
            </a>{' '}
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
                  onChanged={() => void refresh()}
                  onReply={() => setReplyTo(replyTo === c.id ? null : c.id)}
                />
                {repliesOf(c.id).length > 0 && (
                  <ul className="mt-4 space-y-4 border-l border-[var(--color-line)] pl-5">
                    {repliesOf(c.id).map((r) => (
                      <li key={r.id}>
                        <CommentRow
                          comment={r}
                          me={me}
                          myVote={myVotes.get(r.id) ?? 0}
                          onChanged={() => void refresh()}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {replyTo === c.id && me && (
                  <div className="mt-4 border-l border-[var(--color-line)] pl-5">
                    <Composer
                      target={target}
                      parentId={c.id}
                      placeholder="Your reply…"
                      onPosted={() => {
                        setReplyTo(null);
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
  onChanged,
  onReply,
}: {
  comment: Comment;
  me: string | null;
  myVote: VoteValue;
  onChanged: () => void;
  onReply?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const removed = comment.deleted_at !== null;
  const login = comment.author?.gh_login ?? 'bilinmeyen';
  async function cast(next: VoteValue) {
    if (!me || busy) return;
    setBusy(true);
    await voteComment(comment.id, myVote === next ? 0 : next);
    setBusy(false);
    onChanged();
  }
  return (
    <article className="flex gap-3">
      <div className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
        <button
          type="button"
          onClick={() => void cast(1)}
          disabled={!me || removed}
          aria-label="Helpful"
          className={`text-xs leading-none transition ${
            myVote === 1 ? 'text-emerald-400' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
          } disabled:opacity-40`}
        >
          ▲
        </button>
        <span className="text-xs tabular-nums text-[var(--color-muted)]">{comment.vote_score}</span>
        <button
          type="button"
          onClick={() => void cast(-1)}
          disabled={!me || removed}
          aria-label="Not helpful"
          className={`text-xs leading-none transition ${
            myVote === -1 ? 'text-red-400' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
          } disabled:opacity-40`}
        >
          ▼
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
          <ExternalLink href={`https://github.com/${login}`}>{login}</ExternalLink>
          <span>{relativeTime(comment.created_at)}</span>
          {comment.updated_at !== comment.created_at && !removed && <span>· edited</span>}
        </div>
        <p
          className={`mt-1.5 whitespace-pre-wrap text-sm ${
            removed ? 'italic text-[var(--color-muted)]' : ''
          }`}
        >
          {removed ? 'This comment was deleted.' : comment.body}
        </p>
        {!removed && (
          <div className="mt-2 flex gap-4 text-xs text-[var(--color-muted)]">
            {onReply && me && (
              <button type="button" onClick={onReply} className="hover:text-[var(--color-text)]">
                Reply
              </button>
            )}
            {me === comment.author_id ? (
              <button
                type="button"
                onClick={() => {
                  void softDeleteComment(comment.id).then(onChanged);
                }}
                className="hover:text-[var(--color-bad)]"
              >
                Delete
              </button>
            ) : (
              me && <ReportButton targetType="comment" targetId={comment.id} />
            )}
          </div>
        )}
      </div>
    </article>
  );
}
function Composer({
  target,
  parentId,
  placeholder,
  onPosted,
}: {
  target: CommentTarget;
  parentId: string | null;
  placeholder: string;
  onPosted: () => void;
}) {
  const [body, setBody] = useState('');
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
    setBody('');
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
        className="w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-line-active)]"
      />
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!body.trim() || busy}
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-1.5 text-sm transition hover:border-[var(--color-line-active)] disabled:opacity-40"
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}