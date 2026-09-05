import { useEffect, useState } from "react";
import { loadFollows, unreadTargets } from "../../lib/follows";
import {
  lastSeenAt,
  loadMyMentions,
  loadMyReplies,
  unseen,
  unseenMentions,
} from "../../lib/notifications";
import { loadFollowNews, loadFollowRequests } from "../../lib/social";
import { probablySignedIn } from "../../lib/profile";
import { supabase } from "../../lib/supabase";
import Icon from "../Icon";

export default function FollowingLink() {
  const [signedIn, setSignedIn] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;

    function dropPreview() {
      document.getElementById("social-preview")?.remove();
    }

    async function count() {
      const [follows, replies, mentions, seen, requests, told] =
        await Promise.all([
          loadFollows(),
          loadMyReplies(),
          loadMyMentions(),
          lastSeenAt(),
          loadFollowRequests(),
          loadFollowNews(),
        ]);
      if (!alive) return;
      const fresh = told.filter((n) => !n.seen).length;
      setUnread(
        unreadTargets(follows) +
          unseen(replies, seen) +
          unseenMentions(mentions, seen) +
          requests.length +
          fresh,
      );
    }

    if (probablySignedIn()) {
      dropPreview();
      setSignedIn(true);
    }

    const { data: watcher } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      dropPreview();
      setSignedIn(Boolean(session));
      if (session) void count();
    });

    void (async () => {
      const { data } = await supabase!.auth.getSession();
      if (!alive) return;
      if (data.session) {
        dropPreview();
        setSignedIn(true);
        void count();
      }
    })();

    function reread() {
      void count();
    }
    function onVisible() {
      if (document.visibilityState === "visible") void count();
    }
    window.addEventListener("exc:seen", reread);
    window.addEventListener("exc:mail-ping", reread);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      alive = false;
      watcher.subscription.unsubscribe();
      window.removeEventListener("exc:seen", reread);
      window.removeEventListener("exc:mail-ping", reread);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  if (!signedIn) return null;

  const active =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/app/following");

  return (
    <a
      href="/app/following/"
      className={active ? "nav-item nav-item-active" : "nav-item"}
    >
      <span className="flex items-center gap-2.5">
        <Icon name="bell" size={17} />
        Social
      </span>
      {unread > 0 && (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--color-primary)] px-1.5 text-2xs font-semibold leading-5 text-white">
          {unread}
        </span>
      )}
    </a>
  );
}
