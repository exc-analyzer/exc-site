import { useEffect, useState } from 'react';
import {
  ACCENTS,
  accentColor,
  loadMyProfile,
  saveMyProfile,
  shownAvatar,
  shownName,
  type AccentId,
  type Profile,
} from '../../lib/profile';
import { signInWithGitHub } from '../../lib/auth';
import { Blank, BlockSkeleton } from '../console/Chrome';
import Icon from '../Icon';

export default function ProfileEditor() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mode: 'page' | 'onboarding' = profile?.onboarded_at ? 'page' : 'onboarding';

  useEffect(() => {
    void loadMyProfile().then((p) => {
      setProfile(p);
      setLoading(false);
    });
  }, []);

  function patch(next: Partial<Profile>) {
    setProfile((prev) => (prev ? { ...prev, ...next } : prev));
    setSaved(false);
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    setError(null);

    const { error } = await saveMyProfile({
      display_name: profile.display_name?.trim() || null,
      name_source: profile.name_source,
      bio: profile.bio?.trim() || null,
      accent: profile.accent,
      onboarded_at: profile.onboarded_at ?? new Date().toISOString(),
    });

    setSaving(false);
    if (error) {
      setError(error);
      return;
    }
    setSaved(true);
    if (mode === 'onboarding') window.location.href = '/app/';
  }

  if (loading) {
    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <BlockSkeleton height="h-44" />
          <BlockSkeleton height="h-36" />
          <BlockSkeleton height="h-32" />
        </div>
        <BlockSkeleton height="h-56" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Blank
        icon="users"
        title="This page is yours once you sign in"
        lead="Your name and picture come from GitHub. What you change here is how you appear to everyone else."
        action={
          <button type="button" className="btn btn-primary" onClick={() => void signInWithGitHub()}>
            Sign in with GitHub
          </button>
        }
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <section className="surface p-6">
          <h2 className="text-base">Display name</h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            This is the name on your comments and reports. Your GitHub username
            <span className="font-mono"> @{profile.gh_login}</span> always stays next to it.
          </p>

          <div className="mt-4 space-y-3">
            <ChoiceRow
              selected={profile.name_source === 'github'}
              onSelect={() => patch({ name_source: 'github' })}
              title="My name on GitHub"
              detail={profile.gh_name || profile.gh_login}
            />
            <ChoiceRow
              selected={profile.name_source === 'custom'}
              onSelect={() => patch({ name_source: 'custom' })}
              title="A name I choose"
              detail={profile.display_name?.trim() || 'Nothing written yet'}
            />
          </div>

          {profile.name_source === 'custom' && (
            <div className="mt-4">
              <label className="label" htmlFor="display-name">
                Your name
              </label>
              <input
                id="display-name"
                className="field"
                value={profile.display_name ?? ''}
                maxLength={40}
                placeholder="e.g. Berat"
                onChange={(e) => patch({ display_name: e.target.value })}
              />
            </div>
          )}
        </section>

        <section className="surface p-6">
          <h2 className="text-base">Profile picture</h2>
          <div className="mt-4 flex items-center gap-4">
            <Avatar
              src={profile.gh_avatar_url}
              name={shownName(profile)}
              accent={accentColor(profile.accent)}
              size={56}
            />
            <div className="min-w-0 text-xs text-[var(--color-muted)]">
              <p className="text-sm text-[var(--color-text)]">Your GitHub picture is in use</p>
              <p className="mt-1">
                To change it, update your{' '}
                <a
                  href="https://github.com/settings/profile"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  GitHub profile
                </a>
                , then sign out here and back in.
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-[var(--color-faint)]">
            Uploading a picture is deliberately not possible. GitHub does the verifying: accounts
            are verified there, and content moderation and account bans stay on their side.
          </p>
        </section>

        <section className="surface p-6">
          <h2 className="text-base">About</h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">Optional, up to 280 characters.</p>
          <textarea
            className="field mt-4 resize-y"
            rows={3}
            maxLength={280}
            value={profile.bio ?? ''}
            placeholder="What do you build, what are you into?"
            onChange={(e) => patch({ bio: e.target.value })}
          />
          <p className="mt-1.5 text-right text-xs text-[var(--color-faint)]">
            {(profile.bio ?? '').length}/280
          </p>
        </section>

        <section className="surface p-6">
          <h2 className="text-base">Accent colour</h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">Used across your profile.</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => patch({ accent: a.id as AccentId })}
                aria-label={a.label}
                aria-pressed={profile.accent === a.id}
                className={`size-9 rounded-full border-2 transition ${
                  profile.accent === a.id
                    ? 'border-[var(--color-text)] scale-110'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: a.color }}
              />
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? 'Saving…' : mode === 'onboarding' ? 'Save and start' : 'Save'}
          </button>
          {saved && <span className="text-xs text-[var(--color-good)]">Saved</span>}
          {error && <span className="text-xs text-[var(--color-bad)]">{error}</span>}
          {mode === 'onboarding' && (
            <a href="/app/" className="btn btn-quiet">
              Skip for now
            </a>
          )}
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="surface overflow-hidden">
          <div
            className="h-20"
            style={{
              background: `linear-gradient(135deg, ${accentColor(profile.accent)}55, transparent 70%)`,
            }}
          />
          <div className="-mt-10 px-6 pb-6">
            <Avatar
              src={shownAvatar(profile)}
              name={shownName(profile)}
              accent={accentColor(profile.accent)}
              size={72}
            />
            <p className="mt-3 text-base font-semibold">{shownName(profile)}</p>
            <p className="font-mono text-xs text-[var(--color-muted)]">@{profile.gh_login}</p>
            {profile.bio?.trim() && (
              <p className="mt-3 text-sm text-[var(--color-muted)]">{profile.bio}</p>
            )}
            <p className="mt-4 text-xs text-[var(--color-faint)]">This is how you will look.</p>

            <a
              href={`/app/people/${profile.gh_login}/`}
              className="btn btn-ghost mt-4 w-full"
            >
              <Icon name="external" size={14} />
              Open your public page
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ChoiceRow({
  selected,
  onSelect,
  title,
  detail,
  preview,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
  preview?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-[var(--radius-control)] border p-3 text-left transition ${
        selected
          ? 'border-[var(--color-line-active)] bg-[rgba(99,102,241,0.08)]'
          : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)]'
      }`}
    >
      <span
        className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${
          selected ? 'border-[var(--color-primary)]' : 'border-[var(--color-line-strong)]'
        }`}
      >
        {selected && <span className="size-2 rounded-full bg-[var(--color-primary)]" />}
      </span>

      {preview !== undefined && (
        <img
          src={preview || undefined}
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 rounded-full bg-[var(--color-raised)] object-cover"
        />
      )}

      <span className="min-w-0">
        <span className="block text-sm">{title}</span>
        <span className="block truncate text-xs text-[var(--color-muted)]">{detail}</span>
      </span>
    </button>
  );
}

export function Avatar({
  src,
  name,
  accent,
  size = 40,
}: {
  src: string | null;
  name: string;
  accent?: string;
  size?: number;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderColor: accent }}
        className="rounded-full border-2 bg-[var(--color-raised)] object-cover"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size, backgroundColor: accent ?? 'var(--color-primary)' }}
      className="grid place-items-center rounded-full font-semibold text-white"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
