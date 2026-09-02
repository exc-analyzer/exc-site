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
import { Blank, FeedSkeleton } from '../console/Chrome';
import FeedItem from './FeedItem';
import Composer from './Composer';
import { loadMyBookmarks } from '../../lib/social';

const PAGE = 25;

export default function Feed() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [quoting, setQuoting] = useState<Item | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  async function absorb(rows: Item[], append: boolean) {
    const [mine, kept] = await Promise.all([loadMyLikes(rows), loadMyBookmarks(rows)]);
    setLikes((prev) => (append ? new Set([...prev, ...mine]) : mine));
    setSaved((prev) => (append ? new Set([...prev, ...kept]) : kept));
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
        <Composer onPosted={refresh} quoting={quoting} onClearQuote={() => setQuoting(null)} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--color-line)] px-5 py-3.5">
          <p className="text-sm text-[var(--color-muted)]">
            Reading is open to everyone. Sign in to post, reply and like.
          </p>
        </div>
      )}

      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 bg-[var(--color-bg)]/85 px-1 py-2 backdrop-blur-md lg:top-0">
        <div className="flex items-center gap-1">
          {(['all', 'following', 'posts', 'scans'] as FeedFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={filter === f ? 'nav-pill nav-pill-active' : 'nav-pill'}
            >
              {f === 'all'
                ? 'Everything'
                : f === 'following'
                  ? 'Following'
                  : f === 'posts'
                    ? 'Posts'
                    : 'Scans'}
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
        <FeedSkeleton />
      ) : items.length === 0 ? (
        query ? (
          <Blank icon="search" title={`Nothing matches ${query}`} lead="Try a shorter word, or a repository name." />
        ) : filter === 'following' ? (
          <Blank
            icon="users"
            title="Nobody you follow has posted yet"
            lead="Open someone from the feed and press Follow, and what they write lands here."
          />
        ) : (
          <Blank
            icon="compass"
            title="Nothing here yet"
            lead="Scan a repository and it becomes the first thing on this page."
            action={
              <a href="/app/scan/" className="btn btn-primary">
                Scan a repository
              </a>
            }
          />
        )
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
                    saved={saved.has(key)}
                    mine={Boolean(me) && item.author_id === me}
                    signedIn={signedIn}
                    onChanged={refresh}
                    onQuote={
                      signedIn && item.kind === 'post'
                        ? (target) => {
                            setQuoting(target);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        : undefined
                    }
                    onSaved={
                      signedIn
                        ? (on) =>
                            setSaved((prev) => {
                              const next = new Set(prev);
                              if (on) next.add(key);
                              else next.delete(key);
                              return next;
                            })
                        : undefined
                    }
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
