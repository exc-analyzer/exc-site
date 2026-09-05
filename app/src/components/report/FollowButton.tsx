import { useEffect, useState } from "react";
import { follow, isFollowing, unfollow } from "../../lib/follows";
import { supabase } from "../../lib/supabase";

export default function FollowButton({
  owner,
  repo,
}: {
  owner: string;
  repo: string;
}) {
  const [state, setState] = useState<"loading" | "signed-out" | "off" | "on">(
    "loading",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (!supabase) {
        setState("signed-out");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setState("signed-out");
        return;
      }
      setState((await isFollowing(owner, repo)) ? "on" : "off");
    })();
  }, [owner, repo]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const following = state === "on";
    const problem = following
      ? await unfollow(owner, repo)
      : await follow(owner, repo);
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    setState(following ? "off" : "on");
  }

  if (state === "loading") return null;

  if (state === "signed-out") {
    return (
      <a href="/app/" className="btn btn-quiet" title="Sign in to follow">
        Follow
      </a>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={state === "on"}
        className={state === "on" ? "btn btn-quiet" : "btn btn-ghost"}
      >
        {state === "on" ? "Following" : "Follow"}
      </button>
      {error && (
        <span className="text-xs text-[var(--color-bad)]">{error}</span>
      )}
    </div>
  );
}
