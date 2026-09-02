import { useEffect, useState } from 'react';
import { loadFollows, unreadTargets } from '../../lib/follows';
import {
  lastSeenAt,
  loadMyMentions,
  loadMyReplies,
  unseen,
  unseenMentions,
} from '../../lib/notifications';
import { supabase } from '../../lib/supabase';
import Icon from '../Icon';

export default function FollowingLink() {
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const [follows, replies, mentions, seen] = await Promise.all([
        loadFollows(),
        loadMyReplies(),
        loadMyMentions(),
        lastSeenAt(),
      ]);
      setUnread(unreadTargets(follows) + unseen(replies, seen) + unseenMentions(mentions, seen));
    })();
  }, []);

  if (unread === null) return null;

  const active =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/app/following');

  return (
    <a
      href="/app/following/"
      className={active ? 'nav-item nav-item-active' : 'nav-item'}
    >
      <span className="flex items-center gap-2.5">
        <Icon name="bell" size={17} />
        Following
      </span>
      {unread > 0 && (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--color-primary)] px-1.5 text-2xs font-semibold leading-5 text-white">
          {unread}
        </span>
      )}
    </a>
  );
}
