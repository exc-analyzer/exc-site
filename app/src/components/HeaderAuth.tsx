import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { signInWithGitHub, signOutEverywhere } from "../lib/auth";
import {
  STATUSES,
  accentColor,
  cachedProfile,
  loadMyProfile,
  rememberProfile,
  saveMyProfile,
  shownAvatar,
  shownName,
  statusOf,
  type Profile,
  type StatusId,
} from "../lib/profile";
import { Avatar } from "./profile/ProfileEditor";
import Icon from "./Icon";
import Verified from "./Verified";
import { amIModerator } from "../lib/moderation";

export default function HeaderAuth({
  placement = "sidebar",
}: {
  placement?: "sidebar" | "bar";
}) {
  const inBar = placement === "bar";
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [moderator, setModerator] = useState(false);
  const [picking, setPicking] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const known = cachedProfile();
    if (known) {
      setProfile(known);
      setSignedIn(true);
      setReady(true);
    }
    if (!supabase) {
      setReady(true);
      return;
    }
    let alive = true;

    async function settle(session: unknown) {
      if (!alive) return;
      const has = Boolean(session);
      if (has) setProfile(await loadMyProfile());
      else setProfile(null);
      if (!alive) return;
      setSignedIn(has);
      setReady(true);
    }

    const { data: watcher } = supabase.auth.onAuthStateChange((_event, session) => {
      void settle(session);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void settle(data.session);
    });

    return () => {
      alive = false;
      watcher.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void amIModerator().then(setModerator);
  }, [signedIn]);

  useEffect(() => {
    if (!open) return;
    function away(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node))
        setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (ready && !inBar) document.getElementById("account-preview")?.remove();
  }, [ready, inBar]);

  if (!ready) return null;

  if (!signedIn) {
    return (
      <button
        type="button"
        className={`btn btn-ghost ${inBar ? "shrink-0" : "w-full"}`}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signInWithGitHub().then((problem) => {
            if (problem) setBusy(false);
          });
        }}
      >
        {busy ? "Redirecting…" : inBar ? "Sign in" : "Sign in with GitHub"}
      </button>
    );
  }

  async function pickStatus(next: StatusId | null) {
    if (!profile) return;
    setSaving(true);
    const { error } = await saveMyProfile({ status: next });
    setSaving(false);
    if (error) return;
    const updated = { ...profile, status: next };
    setProfile(updated);
    rememberProfile(updated);
    setPicking(false);
    window.dispatchEvent(
      new CustomEvent("exc:status", { detail: { id: profile.id, status: next } }),
    );
  }

  const name = profile ? shownName(profile) : "Account";

  return (
    <div className="relative" ref={box}>
      <div
        className={`flex items-center gap-1 ${inBar ? "max-w-[168px] shrink-0" : "w-full"}`}
      >
        <a
          href={profile ? `/app/people/${profile.gh_login}/` : "/app/profile/"}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left transition hover:bg-[rgba(163,145,224,0.08)]"
        >
          <Avatar
            src={profile ? shownAvatar(profile) : null}
            name={name}
            accent={profile ? accentColor(profile.accent) : undefined}
            size={28}
          />
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span className="truncate text-sm text-[var(--color-text)]">
              {name}
            </span>
            {profile?.verified && <Verified size={13} />}
          </span>
        </a>
        <button
          type="button"
          onClick={() => {
            setOpen((was) => {
              if (!was) {
                const edge = box.current?.getBoundingClientRect();
                setDropUp(
                  edge ? window.innerHeight - edge.bottom < 300 : false,
                );
              }
              return !was;
            });
          }}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={open ? "Close account menu" : "Open account menu"}
          className="shrink-0 rounded-[var(--radius-control)] p-1.5 text-[var(--color-faint)] transition hover:bg-[rgba(163,145,224,0.08)] hover:text-[var(--color-text)]"
        >
          <Icon
            name="chevron"
            size={17}
            className={`transition ${open ? "rotate-90" : ""}`}
          />
        </button>
      </div>

      {open && picking && profile && (
        <div
          role="menu"
          className={`absolute z-50 max-h-[min(60vh,380px)] w-56 overflow-y-auto rounded-[var(--radius-control)] border border-[var(--color-line-strong)] bg-[var(--color-raised)] py-1 shadow-[var(--shadow-lift)] ${
            inBar
              ? "right-0 top-full mt-2"
              : dropUp
                ? "bottom-0 left-full ml-2"
                : "left-full top-0 ml-2"
          }`}
        >
          <p className="px-3 pb-1.5 pt-1 text-2xs uppercase tracking-wider text-[var(--color-faint)]">
            What you are up to
          </p>
                {STATUSES.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={saving}
                    className="menu-item w-full text-left"
                    onClick={() => void pickStatus(entry.id as StatusId)}
                  >
                    <span aria-hidden="true" className="w-[15px] text-center">
                      {entry.emoji}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {entry.label}
                    </span>
                    {profile.status === entry.id && (
                      <Icon
                        name="check"
                        size={13}
                        className="shrink-0 text-[var(--color-accent)]"
                      />
                    )}
                  </button>
                ))}
                {profile.status && (
                  <button
                    type="button"
                    disabled={saving}
                    className="menu-item w-full text-left text-[var(--color-muted)]"
                    onClick={() => void pickStatus(null)}
                  >
                    <span className="w-[15px] text-center">
                      <Icon name="cross" size={12} />
                    </span>
                    Clear it
                  </button>
                )}
        </div>
      )}

      {open && (
        <div
          role="menu"
          className={`absolute z-40 max-h-[min(70vh,460px)] min-w-[190px] overflow-y-auto rounded-[var(--radius-control)] border border-[var(--color-line-strong)] bg-[var(--color-raised)] shadow-[var(--shadow-lift)] ${
            inBar
              ? "right-0 top-full mt-2"
              : dropUp
                ? "bottom-full left-0 mb-2 w-full"
                : "left-0 top-full mt-2 w-full"
          }`}
        >
          {profile && (
            <p className="border-b border-[var(--color-line)] px-3 py-2 font-mono text-2xs text-[var(--color-faint)]">
              @{profile.gh_login}
            </p>
          )}
          {profile && (
            <>
              <button
                type="button"
                className="menu-item w-full text-left"
                disabled={saving}
                onClick={() => setPicking((v) => !v)}
              >
                <span aria-hidden="true" className="w-[15px] text-center">
                  {statusOf(profile.status)?.emoji ?? "\u{1F4AC}"}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {statusOf(profile.status)?.label ?? "Set a status"}
                </span>
                <Icon
                  name="chevron"
                  size={12}
                  className="shrink-0 text-[var(--color-faint)]"
                />
              </button>


              <a
                href={`/app/people/${profile.gh_login}/`}
                role="menuitem"
                className="menu-item"
              >
                <Icon name="user" size={15} />
                Profile
              </a>
            </>
          )}
          {moderator && (
            <a href="/app/moderation/" role="menuitem" className="menu-item">
              <Icon name="shield" size={15} />
              Moderation
            </a>
          )}
          <a href="/app/profile/" role="menuitem" className="menu-item">
            <Icon name="sliders" size={15} />
            Settings
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
