import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { signInWithGitHub } from "../lib/auth";

function hasStoredSession(): boolean {
  try {
    for (const store of [localStorage, sessionStorage]) {
      for (const key of Object.keys(store)) {
        if (key.startsWith("sb-") && key.endsWith("-auth-token")) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

export default function AutoSignIn() {
  const [going, setGoing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    const asked = new URLSearchParams(window.location.search).get("signin");
    if (asked !== "1") return;

    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.hash,
    );

    if (hasStoredSession()) return;

    setGoing(true);
    void (async () => {
      const trouble = await signInWithGitHub(window.location.pathname);
      if (trouble) {
        setProblem(trouble);
        setGoing(false);
      }
    })();
  }, []);

  if (!going && !problem) return null;

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center bg-[var(--color-bg)] p-6 text-center">
      {problem ? (
        <div className="max-w-sm">
          <p className="text-base font-semibold">GitHub did not open</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
            {problem}
          </p>
          <a href="/app/scan/" className="btn btn-primary mt-5">
            Try from the scan page
          </a>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted)]">Taking you to GitHub…</p>
      )}
    </div>
  );
}
