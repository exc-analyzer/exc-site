import { useEffect, useState } from "react";
import type { Trouble } from "../lib/trouble";
import Icon from "./Icon";

export default function TroubleBar() {
  const [what, setWhat] = useState<string | null>(null);

  useEffect(() => {
    let timer: number | null = null;
    const heard = (event: Event) => {
      const detail = (event as CustomEvent<Trouble>).detail;
      if (!detail) return;
      setWhat(detail.where);
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => setWhat(null), 12000);
    };
    window.addEventListener("exc:problem", heard);
    return () => {
      window.removeEventListener("exc:problem", heard);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  if (!what) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-line-strong)] bg-[var(--color-raised)] px-4 py-3 shadow-lg sm:inset-x-auto sm:right-4"
    >
      <span className="min-w-0 flex-1 text-sm text-[var(--color-text)]">
        Could not load {what}. What you see may be incomplete.
      </span>
      <button
        type="button"
        className="btn btn-quiet btn-sm shrink-0"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        className="shrink-0 text-[var(--color-faint)] transition hover:text-[var(--color-text)]"
        onClick={() => setWhat(null)}
      >
        <Icon name="cross" size={14} />
      </button>
    </div>
  );
}
