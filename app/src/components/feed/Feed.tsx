import { useEffect, useState } from 'react';
import {
  currentUserId,
  loadFeed,
  loadMyLikes,
  type FeedFilter,
  type FeedItem as Item,
} from '../../lib/feed';
import Icon from '../Icon';
import { supabase } from '../../lib/supabase';
import { Empty } from '../console/ui';
import FeedItem from './FeedItem';
import Composer from './Composer';

const PAGE = 25;

export default function Feed() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

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
        setMe(await currentUserId());
      }
    })();
  }, []);

  useEffect(() => {
    setItems(null);
    void (async () => absorb(await loadFeed(PAGE, undefined, filter, query), false))();
  }, [filter, query]);

  async function loadMore() {
    if (!items || items.length === 0 || loadingMore) return;
    setLoadingMore(true);
    const rows = await loadFeed(PAGE, items[items.length - 1].happened_at, filter, query);
    await absorb(rows, true);
    setLoadingMore(false);
  }

  function refresh() {
    void (async () => absorb(await loadFeed(PAGE, undefined, filter, query), false))();
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {(['all', 'posts', 'scans'] as FeedFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={filter === f ? 'nav-pill nav-pill-active' : 'nav-pill'}
            >
              {f === 'all' ? 'Everything' : f === 'posts' ? 'Posts' : 'Scans'}
            </button>
          ))}
        </div>

        <form
          className="ml-auto flex min-w-0 flex-1 basis-44 items-center gap-2 rounded-full border border-[var(--color-line)] px-3 py-1.5 focus-within:border-[var(--color-line-active)]"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
          }}
        >
          <Icon name="search" size={14} className="text-[var(--color-faint)]" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-faint)]"
            value={search}
            placeholder="Search posts and repositories"
            onChange={(e) => setSearch(e.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear"
              className="text-[var(--color-faint)] hover:text-[var(--color-text)]"
              onClick={() => {
                setSearch('');
                setQuery('');
              }}
            >
              <Icon name="cross" size={13} />
            </button>
          )}
        </form>
      </div>

      {items === null ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : items.length === 0 ? (
        <Empty>
          {query
            ? `Nothing matches ${query}.`
            : 'Nothing here yet. Scan a repository and it becomes the first thing on this page.'}
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
                    mine={Boolean(me) && item.author_id === me}
                    signedIn={signedIn}
                    onChanged={refresh}
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
