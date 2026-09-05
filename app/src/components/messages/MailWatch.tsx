import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { unreadTotal, watchMail } from "../../lib/messages";

const ON_MESSAGES = () =>
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/app/messages");

function paint(count: number): void {
  document.querySelectorAll<HTMLElement>("[data-mail-badge]").forEach((el) => {
    el.textContent = count > 99 ? "99+" : String(count);
    el.hidden = count === 0;
  });
}

export default function MailWatch() {
  const [announce, setAnnounce] = useState(false);
  const known = useRef(0);
  const base = useRef("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!supabase) return;
    base.current = document.title;
    let alive = true;
    let unwatch = () => {};

    async function refresh(fromPing: boolean): Promise<void> {
      const count = await unreadTotal();
      if (!alive) return;
      paint(count);
      document.title = count > 0 ? `(${count}) ${base.current}` : base.current;
      if (fromPing && count > known.current && !ON_MESSAGES()) {
        setAnnounce(true);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setAnnounce(false), 7000);
      }
      known.current = count;
    }

    const onLocal = () => void refresh(false);
    window.addEventListener("exc:mail", onLocal);

    const sweep = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, 30000);

    void (async () => {
      const { data } = await supabase!.auth.getSession();
      const me = data.session?.user.id;
      if (!me || !alive) return;
      await refresh(false);
      unwatch = watchMail(() => {
        window.dispatchEvent(new Event("exc:mail-ping"));
        if (ON_MESSAGES()) return;
        void refresh(true);
      });
    })();

    return () => {
      alive = false;
      window.removeEventListener("exc:mail", onLocal);
      window.clearInterval(sweep);
      if (timer.current) window.clearTimeout(timer.current);
      unwatch();
    };
  }, []);

  if (!announce) return null;

  return (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-50 max-w-[calc(100vw-2.5rem)] animate-[mailin_180ms_ease-out]"
    >
      <a
        href="/app/messages/"
        className="surface flex items-center gap-3 px-4 py-3 shadow-lg transition hover:border-[var(--color-accent)]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-primary-soft)]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">New message</span>
          <span className="block text-xs text-[var(--color-muted)]">
            Open your messages to read it
          </span>
        </span>
      </a>
    </div>
  );
}
