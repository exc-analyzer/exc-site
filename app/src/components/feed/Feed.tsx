import { useEffect, useState } from 'react';
import { createPost, loadFeed, loadMyLikes, type FeedItem as Item } from '../../lib/feed';
import { parseRepo } from '../../lib/github';
import { supabase } from '../../lib/supabase';
import { Empty } from '../console/ui';
import FeedItem from './FeedItem';

const PAGE = 25;

export default function Feed() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState(false);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  async function absorb(rows: Item[], append: boolean) {
    const mine = await loadMyLikes(rows);
    setLikes((prev) => (append ? new Set([...prev, ...mine]) : mine));
    setItems((prev) => (append && prev ? [...prev, ...rows] : rows));
    setMore(rows.length === PAGE);
  }

  useEffect(() => {
    void (async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        setSignedIn(Boolean(data.session));
      }
      await absorb(await loadFeed(PAGE), false);
    })();
  }, []);

  async function loadMore() {
    if (!items || items.length === 0 || loadingMore) return;
    setLoadingMore(true);
    const rows = await loadFeed(PAGE, items[items.length - 1].happened_at);
    await absorb(rows, true);
    setLoadingMore(false);
  }

  function refresh() {
    void (async () => absorb(await loadFeed(PAGE), false))();
  }

  return (
    <div className="space-y-5">
      {signedIn ? (
        <Composer onPosted={refresh} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--color-line)] px-5 py-3.5">
          <p className="text-sm text-[var(--color-muted)]">
            Reading is open to everyone. Sign in to post, reply and like.
          </p>
        </div>
      )}

      {items === null ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : items.length === 0 ? (
        <Empty>
          Nothing here yet. Scan a repository and it becomes the first thing on this page.
        </Empty>
      ) : (
        <>
          <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
            {items.map((item) => {
              const key = `${item.kind}:${item.id}`;
              return (
                <li key={key}>
                  <FeedItem
                    item={item}
                    liked={likes.has(key)}
                    onLiked={(on) =>
                      setLikes((prev) => {
                        const next = new Set(prev);
                        if (on) next.add(key);
                        else next.delete(key);
                        return next;
                      })
                    }
                  />
                </li>
              );
            })}
          </ul>

          {more && (
            <div className="pt-4 text-center">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? 'Loading…' : 'Show older'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Composer({ onPosted }: { onPosted: () => void }) {
  const [body, setBody] = useState('');
  const [repo, setRepo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = repo.trim() ? parseRepo(repo) : null;
  const repoInvalid = repo.trim().length > 0 && parsed === null;

  async function submit() {
    if (!body.trim() || busy || repoInvalid) return;
    setBusy(true);
    setError(null);
    const { error } = await createPost(body, parsed ?? undefined);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    setBody('');
    setRepo('');
    onPosted();
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:p-5">
      <textarea
        className="field resize-y"
        rows={3}
        maxLength={4000}
        value={body}
        placeholder="What is on your mind?"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          className="field max-w-xs flex-1"
          value={repo}
          placeholder="Add a repository (optional)"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => setRepo(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary ml-auto"
          disabled={!body.trim() || busy || repoInvalid}
          onClick={() => void submit()}
        >
          {busy ? 'Posting…' : 'Post'}
        </button>
      </div>
      {repoInvalid && (
        <p className="mt-2 text-xs text-[var(--color-warn)]">
          A repository is written as owner/repo.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-[var(--color-bad)]">{error}</p>}
    </div>
  );
}
