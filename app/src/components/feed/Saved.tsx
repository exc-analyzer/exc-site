import { useEffect, useState } from 'react';
import { currentUserId, loadMyLikes, type FeedItem as Item } from '../../lib/feed';
import { loadMyBookmarks, loadSaved } from '../../lib/social';
import { supabase } from '../../lib/supabase';
import { Card, Empty } from '../console/ui';
import FeedItem from './FeedItem';

export default function Saved() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [me, setMe] = useState<string | null>(null);

  async function load() {
    const rows = await loadSaved();
    const [mine, kept] = await Promise.all([loadMyLikes(rows), loadMyBookmarks(rows)]);
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

  if (signedIn === null) {
    return <p className="text-sm text-[var(--color-muted)]">Loading…</p>;
  }

  if (!signedIn) {
    return (
      <Card>
        <div className="px-6 py-10 text-center">
          <p className="text-base">Saving needs an account</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">
            Keep a post or a scan to come back to. What you save is yours alone; nobody else can
            see it.
          </p>
          <a href="/app/" className="btn btn-ghost mt-5">
            Back to the feed
          </a>
        </div>
      </Card>
    );
  }

  if (items === null) {
    return <p className="text-sm text-[var(--color-muted)]">Loading…</p>;
  }

  if (items.length === 0) {
    return <Empty>Nothing saved yet. Use the bookmark on anything worth returning to.</Empty>;
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
