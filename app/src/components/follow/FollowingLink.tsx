import { useEffect, useState } from 'react';
import { loadFollows, unreadTargets } from '../../lib/follows';
import { supabase } from '../../lib/supabase';

export default function FollowingLink() {
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      setUnread(unreadTargets(await loadFollows()));
    })();
  }, []);

  if (unread === null) return null;

  return (
    <a href="/app/following/" className="btn btn-quiet relative">
      Following
      {unread > 0 && (
        <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--color-primary)] px-1.5 text-[11px] font-semibold leading-5 text-white">
          {unread}
        </span>
      )}
    </a>
  );
}
