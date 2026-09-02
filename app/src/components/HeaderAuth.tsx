import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { signInWithGitHub, signOutEverywhere } from '../lib/auth';
import { accentColor, loadMyProfile, shownAvatar, shownName, type Profile } from '../lib/profile';
import { Avatar } from './profile/ProfileEditor';
import Icon from './Icon';

export default function HeaderAuth() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!open) return;
    function away(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  if (!ready) return null;

  if (!signedIn) {
    return (
      <button
        type="button"
        className="btn btn-ghost w-full"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signInWithGitHub().then((problem) => {
            if (problem) setBusy(false);
          });
        }}
      >
        {busy ? 'Redirecting…' : 'Sign in with GitHub'}
      </button>
    );
  }

  const name = profile ? shownName(profile) : 'Account';

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left transition hover:bg-[rgba(163,145,224,0.08)]"
      >
        <Avatar
          src={profile ? shownAvatar(profile) : null}
          name={name}
          accent={profile ? accentColor(profile.accent) : undefined}
          size={28}
        />
        <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">{name}</span>
        <Icon name="chevron" size={14} className={`text-[var(--color-faint)] transition ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-40 mb-2 w-full min-w-[190px] overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-line-strong)] bg-[var(--color-raised)] shadow-[var(--shadow-lift)]"
        >
          {profile && (
            <p className="border-b border-[var(--color-line)] px-3 py-2 font-mono text-2xs text-[var(--color-faint)]">
              @{profile.gh_login}
            </p>
          )}
          <a href="/app/profile/" role="menuitem" className="menu-item">
            <Icon name="compass" size={15} />
            Your profile
          </a>
          <a href="/app/following/" role="menuitem" className="menu-item">
            <Icon name="bell" size={15} />
            Following
          </a>
          <button
            type="button"
            role="menuitem"
            className="menu-item w-full text-left text-[var(--color-bad)]"
            onClick={() => void signOutEverywhere()}
          >
            <Icon name="logout" size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
