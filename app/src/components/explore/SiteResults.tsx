import { useEffect, useState } from "react";
import {
  currentUserId,
  loadFeed,
  loadMyLikes,
  type FeedItem as Item,
} from "../../lib/feed";
import { loadMyBookmarks } from "../../lib/social";
import { memberHref, searchMembers, type Member } from "../../lib/people";
import { accentColor, probablySignedIn } from "../../lib/profile";
import { Avatar } from "../profile/ProfileEditor";
import { FeedSkeleton } from "../console/Chrome";
import FeedItem from "../feed/FeedItem";
import Icon from "../Icon";
import Verified from "../Verified";

const PAGE = 10;

export default function SiteResults({ query }: { query: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [people, setPeople] = useState<Member[]>([]);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState(false);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    if (!probablySignedIn()) return;
    setSignedIn(true);
    void currentUserId().then(setMe);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!query) {
      setItems(null);
      setPeople([]);
      return;
    }
    setItems(null);
    void searchMembers(query).then((found) => {
      if (alive) setPeople(found);
    });
    void (async () => {
      const rows = await loadFeed(PAGE, undefined, "all", query);
      if (!alive) return;
      const [mine, kept] = await Promise.all([
        loadMyLikes(rows),
        loadMyBookmarks(rows),
      ]);
      if (!alive) return;
      setLikes(mine);
      setSaved(kept);
      setItems(rows);
    })();
    return () => {
      alive = false;
    };
  }, [query]);

  function refresh() {
    void (async () => {
      const rows = await loadFeed(PAGE, undefined, "all", query);
      setItems(rows);
    })();
  }

  if (!query) return null;

  const nothing = items !== null && items.length === 0 && people.length === 0;

  if (nothing) {
    return (
      <section className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-4">
        <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <Icon name="search" size={14} className="text-[var(--color-faint)]" />
          Nobody here matches {query}. The repositories below come from GitHub.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {people.length > 0 && (
        <section>
          <p className="eyebrow mb-3">People</p>
          <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
            {people.map((person) => (
              <li key={person.id}>
                <a
                  href={memberHref(person.gh_login) ?? "#"}
                  className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[rgba(163,145,224,0.04)]"
                >
                  <Avatar
                    src={person.avatar_url}
                    name={person.shown_name}
                    accent={accentColor(person.accent)}
                    shape={person.avatar_shape}
                    size={34}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm text-[var(--color-text)]">
                        {person.shown_name}
                      </span>
                      {person.verified && <Verified size={13} />}
                      {person.private_account && (
                        <span
                          title="A private account. What they post is only shown to the people they let in."
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-line-strong)] px-1.5 py-0.5 text-2xs text-[var(--color-muted)]"
                        >
                          <Icon name="eye" size={10} />
                          Private
                        </span>
                      )}
                    </span>
                    <span className="block truncate font-mono text-xs text-[var(--color-muted)]">
                      @{person.gh_login}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--color-muted)]">
                    {person.follower_count} follower
                    {person.follower_count === 1 ? "" : "s"}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {items === null ? (
        <FeedSkeleton />
      ) : (
        items.length > 0 && (
          <section>
            <p className="eyebrow mb-3">Posts and scans</p>
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
          </section>
        )
      )}
    </div>
  );
}
