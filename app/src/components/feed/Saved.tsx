import { useEffect, useState } from "react";
import {
  currentUserId,
  loadMyLikes,
  type FeedItem as Item,
} from "../../lib/feed";
import { loadMyBookmarks, loadSaved } from "../../lib/social";
import { supabase } from "../../lib/supabase";
import { Blank, FeedSkeleton } from "../console/Chrome";
import FeedItem from "./FeedItem";

export default function Saved() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [me, setMe] = useState<string | null>(null);

  async function load() {
    const rows = await loadSaved();
    const [mine, kept] = await Promise.all([
      loadMyLikes(rows),
      loadMyBookmarks(rows),
    ]);
    setLikes(mine);
    setSaved(kept);
    setItems(rows);
  }

  useEffect(() => {
    void (async () => {
      if (!supabase) {
        setSignedIn(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      const has = Boolean(data.session);
      setSignedIn(has);
      if (!has) return;
      setMe(await currentUserId());
      await load();
    })();
  }, []);

  if (signedIn === null) return <FeedSkeleton rows={3} />;

  if (!signedIn) {
    return (
      <Blank
        icon="bookmark"
        title="Saving needs an account"
        lead="Keep a post or a scan to come back to. What you save is yours alone; nobody else can see it."
        action={
          <a href="/app/" className="btn btn-ghost">
            Back to the feed
          </a>
        }
      />
    );
  }

  if (items === null) return <FeedSkeleton rows={3} />;

  if (items.length === 0) {
    return (
      <Blank
        icon="bookmark"
        title="Nothing saved yet"
        lead="Use the bookmark on anything worth returning to."
      />
    );
  }

  return (
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
              signedIn
              onChanged={() => void load()}
              onSaved={() => void load()}
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
  );
}
