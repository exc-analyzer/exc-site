import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { signInWithGitHub } from '../lib/auth';
import { accentColor, loadMyProfile, shownAvatar, shownName, type Profile } from '../lib/profile';
import { Avatar } from './profile/ProfileEditor';

export default function HeaderAuth() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!supabase) {
        setReady(true);
        return;
      }
      const { data } = await supabase.auth.getSession();
      const has = Boolean(data.session);
      setSignedIn(has);
      setReady(true);
      if (has) setProfile(await loadMyProfile());
    })();
  }, []);

  if (!ready) return null;

  if (!signedIn) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signInWithGitHub().then((problem) => {
            if (problem) setBusy(false);
          });
        }}
      >
        {busy ? 'Redirecting…' : 'Sign in'}
      </button>
    );
  }

  return (
    <a
      href="/app/profile/"
      className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-[rgba(163,145,224,0.08)]"
      title="Your profile"
    >
      <Avatar
        src={profile ? shownAvatar(profile) : null}
        name={profile ? shownName(profile) : '?'}
        accent={profile ? accentColor(profile.accent) : undefined}
        size={26}
      />
      <span className="hidden text-sm text-[var(--color-muted)] sm:inline">
        {profile ? shownName(profile) : 'Profile'}
      </span>
    </a>
  );
}
