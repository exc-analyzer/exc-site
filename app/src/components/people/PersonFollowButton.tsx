import { useEffect, useState } from "react";
import {
  cancelFollowRequest,
  followPerson,
  hasPendingRequest,
  isFollowingPerson,
  requestFollow,
  unfollowPerson,
} from "../../lib/social";
import { signInWithGitHub } from "../../lib/auth";

export default function PersonFollowButton({
  personId,
  signedIn,
  privateAccount = false,
  onChanged,
}: {
  personId: string;
  signedIn: boolean;
  privateAccount?: boolean;
  onChanged?: () => void;
}) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setFollowing(false);
      return;
    }
    void (async () => {
      const [is, waiting] = await Promise.all([
        isFollowingPerson(personId),
        privateAccount ? hasPendingRequest(personId) : Promise.resolve(false),
      ]);
      setFollowing(is);
      setPending(waiting);
    })();
  }, [personId, signedIn, privateAccount]);

  if (following === null) return null;

  if (!signedIn) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => void signInWithGitHub()}>
        Follow
      </button>
    );
  }

  function run(work: Promise<string | null>, after: () => void) {
    setBusy(true);
    setError(null);
    void work.then((problem) => {
      setBusy(false);
      if (problem) {
        setError(problem);
        return;
      }
      after();
      onChanged?.();
    });
  }

  const label = following
    ? "Following"
    : pending
      ? "Requested"
      : privateAccount
        ? "Ask to follow"
        : "Follow";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        aria-pressed={following}
        title={pending ? "Waiting for them to accept. Press again to take it back." : undefined}
        className={following || pending ? "btn btn-quiet" : "btn btn-primary"}
        onClick={() => {
          if (following) {
            run(unfollowPerson(personId), () => setFollowing(false));
          } else if (pending) {
            run(cancelFollowRequest(personId), () => setPending(false));
          } else if (privateAccount) {
            run(requestFollow(personId), () => setPending(true));
          } else {
            run(followPerson(personId), () => setFollowing(true));
          }
        }}
      >
        {label}
      </button>
      {error && <span className="text-xs text-[var(--color-bad)]">{error}</span>}
    </div>
  );
}
