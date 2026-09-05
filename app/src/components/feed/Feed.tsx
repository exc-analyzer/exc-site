import { useEffect, useState } from "react";
import {
  currentUserId,
  loadFeed,
  loadMyLikes,
  type FeedFilter,
  type FeedItem as Item,
} from "../../lib/feed";
import Icon from "../Icon";
import { supabase } from "../../lib/supabase";
import { Blank, FeedSkeleton } from "../console/Chrome";
import FeedItem from "./FeedItem";
import Composer from "./Composer";
import { loadMyBookmarks } from "../../lib/social";
import { signInWithGitHub } from "../../lib/auth";
import { probablySignedIn } from "../../lib/profile";

const PAGE = 25;
const GUEST_PREVIEW = 10;

export default function Feed() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [quoting, setQuoting] = useState<Item | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>("all");

  async function absorb(rows: Item[], append: boolean) {
    const [mine, kept] = await Promise.all([
      loadMyLikes(rows),
      loadMyBookmarks(rows),
    ]);
    setLikes((prev) => (append ? new Set([...prev, ...mine]) : mine));
    setSaved((prev) => (append ? new Set([...prev, ...kept]) : kept));
    setItems((prev) => (append && prev ? [...prev, ...rows] : rows));
    setMore(rows.length === PAGE);
  }

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    if (probablySignedIn()) setSignedIn(true);

    async function apply(session: unknown) {
      if (!alive) return;
      setSignedIn(Boolean(session));
      setMe(session ? await currentUserId() : null);
    }

    const { data: watcher } = supabase.auth.onAuthStateChange((_event, session) => {
      void apply(session);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void apply(data.session);
    });

    return () => {
      alive = false;
      watcher.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setItems(null);
    void (async () => absorb(await loadFeed(PAGE, undefined, filter), false))();
  }, [filter]);

  async function loadMore() {
    if (!items || items.length === 0 || loadingMore) return;
    setLoadingMore(true);
    const rows = await loadFeed(
      PAGE,
      items[items.length - 1].happened_at,
      filter,
    );
    await absorb(rows, true);
    setLoadingMore(false);
  }

  function refresh() {
    void (async () => absorb(await loadFeed(PAGE, undefined, filter), false))();
  }

  const onScreen = signedIn ? (items ?? []) : (items ?? []).slice(0, GUEST_PREVIEW);
  const capped = !signedIn && items !== null && (items.length > GUEST_PREVIEW || more);

  return (
    <div className="space-y-5">
      {signedIn ? (
        <Composer
          onPosted={refresh}
          quoting={quoting}
          onClearQuote={() => setQuoting(null)}
        />
      ) : (
        <section className="guest-only overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="rule-brand" />
          <div className="px-6 py-6">
            <h2 className="text-xl">Nobody reads the code they depend on</h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--color-muted)]">
              So people here scan it instead, and leave what they found in the open: how well a
              repository is defended, what is missing, what got better. Everything below was found
              by someone. Reading it costs you nothing, and scanning works without an account
              either.
            </p>
            <div className="mt-5">
              <a href="/app/explore/" className="btn btn-ghost">
                <Icon name="compass" size={15} />
                See what holds up
              </a>
            </div>
          </div>
        </section>
      )}

      {signedIn && (
        <div className="sticky top-0 z-20 -mx-1 flex items-center gap-1 bg-[var(--color-bg)]/85 px-1 py-2 backdrop-blur-md lg:top-0">
          {(["all", "following", "posts", "scans"] as FeedFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={filter === f ? "nav-pill nav-pill-active" : "nav-pill"}
            >
              {f === "all"
                ? "Everything"
                : f === "following"
                  ? "Following"
                  : f === "posts"
                    ? "Posts"
                    : "Scans"}
            </button>
          ))}
        </div>
      )}

      {items === null ? (
        <FeedSkeleton />
      ) : items.length === 0 ? (
        filter === "following" ? (
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
            {onScreen.map((item) => {
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
                      signedIn && item.kind === "post"
                        ? (target) => {
                            setQuoting(target);
                            window.scrollTo({ top: 0, behavior: "smooth" });
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

          {!signedIn && capped ? (
            <div className="guest-only rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-8 text-center">
              <p className="text-base text-[var(--color-text)]">
                There is more going on than this
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">
                Sign in to read the rest of the feed, follow the repositories you depend on, and
                say what you find. Scanning already works without an account.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void signInWithGitHub()}
                >
                  <Icon name="github" size={15} />
                  Sign in with GitHub
                </button>
                <a href="/app/scan/" className="btn btn-ghost">
                  Scan a repository
                </a>
              </div>
            </div>
          ) : (
            more &&
            signedIn && (
              <div className="pt-4 text-center">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? "Loading…" : "Show older"}
                </button>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
