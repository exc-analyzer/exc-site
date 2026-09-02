import { useEffect, useState } from 'react';
import { followPerson, isFollowingPerson, unfollowPerson } from '../../lib/social';
import { signInWithGitHub } from '../../lib/auth';

export default function PersonFollowButton({
  personId,
  signedIn,
}: {
  personId: string;
  signedIn: boolean;
}) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setFollowing(false);
      return;
    }
    void isFollowingPerson(personId).then(setFollowing);
  }, [personId, signedIn]);

  if (following === null) return null;

  if (!signedIn) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => void signInWithGitHub()}>
        Follow
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        aria-pressed={following}
        className={following ? 'btn btn-quiet' : 'btn btn-primary'}
        onClick={() => {
          setBusy(true);
          setError(null);
          const run = following ? unfollowPerson(personId) : followPerson(personId);
          void run.then((problem) => {
            setBusy(false);
            if (problem) setError(problem);
            else setFollowing(!following);
          });
        }}
      >
        {following ? 'Following' : 'Follow'}
      </button>
      {error && <span className="text-xs text-[var(--color-bad)]">{error}</span>}
    </div>
  );
}
