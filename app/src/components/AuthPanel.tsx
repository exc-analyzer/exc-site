import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isConfigured } from '../lib/supabase';
import { rememberGithubToken, getGithubToken, forgetGithubToken } from '../lib/githubToken';
import { accentColor, loadMyProfile, shownAvatar, shownName, type Profile } from '../lib/profile';
import { Avatar } from './profile/ProfileEditor';

const SCOPES = 'read:user public_repo';
async function isTokenUsable(token: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    return res.status !== 401;
  } catch {
    return true;
  }
}
async function refreshTokenState(apply: (usable: boolean) => void): Promise<void> {
  const token = getGithubToken();
  if (!token) {
    apply(false);
    return;
  }
  const usable = await isTokenUsable(token);
  if (!usable) forgetGithubToken();
  apply(usable);
}
export default function AuthPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      void refreshTokenState(setHasToken);
      if (data.session) void loadMyProfile().then(setProfile);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);

      if (next?.provider_token) rememberGithubToken(next.provider_token);
      if (event === 'SIGNED_OUT') {
        forgetGithubToken();
        setHasToken(false);
        setProfile(null);
        return;
      }
      void refreshTokenState(setHasToken);
      if (next) {
        void loadMyProfile().then((p) => {
          setProfile(p);
          if (p && !p.onboarded_at && !window.location.pathname.startsWith('/app/profile')) {
            window.location.href = '/app/profile/';
          }
        });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  async function signIn() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { scopes: SCOPES, redirectTo: `${window.location.origin}/app/` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }
  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    forgetGithubToken();
    await supabase.auth.signOut();
    setBusy(false);
  }
  if (!isConfigured) {
    return (
      <div className="surface p-6">
        <h2 className="text-base font-semibold">Setup is not finished</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          <code>PUBLIC_SUPABASE_URL</code> and <code>PUBLIC_SUPABASE_ANON_KEY</code> are
          both required.
        </p>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="surface p-6">
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="surface overflow-hidden">
        <div className="p-6 sm:p-8">
          <h2 className="text-xl font-bold">Scanning works without an account</h2>
          <p className="mt-2 max-w-md text-sm text-[var(--color-muted)]">
            Signing in raises your limit from 60 requests an hour to 5,000, and lets you save,
            share and comment on what you find.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-[var(--color-muted)]">
            <li>Only public repository data and your profile are requested.</li>
            <li>Access to your private repositories is never asked for.</li>
            <li>Scans run in your browser, against your own quota.</li>
          </ul>

          <button onClick={signIn} disabled={busy} className="btn btn-primary mt-6">
            {busy ? 'Redirecting…' : 'Continue with GitHub'}
          </button>
          {error && <p className="mt-3 text-sm text-[var(--color-bad)]">{error}</p>}
        </div>
      </div>
    );
  }

  const name = profile ? shownName(profile) : (session.user.user_metadata?.user_name ?? 'you');
  const avatar = profile ? shownAvatar(profile) : (session.user.user_metadata?.avatar_url ?? null);
  const accent = profile ? accentColor(profile.accent) : undefined;

  return (
    <div className="surface p-6">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar src={avatar} name={name} accent={accent} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{name}</p>
          {profile && (
            <p className="truncate font-mono text-xs text-[var(--color-muted)]">
              @{profile.gh_login}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a href="/app/profile/" className="btn btn-ghost">
            Profile
          </a>
          <button onClick={signOut} disabled={busy} className="btn btn-quiet">
            Sign out
          </button>
        </div>
      </div>

      <div
        className={`mt-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border px-4 py-3 text-xs ${
          hasToken
            ? 'border-[var(--color-line)] text-[var(--color-muted)]'
            : 'border-amber-900/60 bg-amber-950/20 text-amber-200/90'
        }`}
      >
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: hasToken ? 'var(--color-good)' : 'var(--color-warn)' }}
        />
        <span className="min-w-0 flex-1">
          {hasToken
            ? 'GitHub is connected. Scans run against your own 5,000/hour quota.'
            : 'GitHub is disconnected, so scans fall back to 60 requests an hour.'}
        </span>
        {!hasToken && (
          <button onClick={signIn} disabled={busy} className="btn btn-ghost">
            Reconnect
          </button>
        )}
      </div>
    </div>
  );
}