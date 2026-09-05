import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ACCENTS,
  accentColor,
  BANNER_STYLES,
  AVATAR_SHAPES,
  BANNER_HEIGHTS,
  GRADIENT_ANGLES,
  STATUSES,
  avatarRadius,
  bannerHeightPx,
  statusOf,
  bannerLook,
  bannerSize,
  type AvatarShape,
  type BannerHeight,
  type GradientAngle,
  type StatusId,
  forgetScansPublic,
  type BannerStyle,
  loadMyProfile,
  saveMyProfile,
  shownAvatar,
  shownName,
  type AccentId,
  type Profile,
} from "../../lib/profile";
import Verified from "../Verified";
import {
  addPin,
  loadPins,
  MAX_PINS,
  parseRepo,
  removePin,
  reorderPins,
  repoResolves,
  verifyRepo,
  type PinnedRepo,
} from "../../lib/pins";
import {
  readDensity,
  writeDensity,
  readZoom,
  writeZoom,
  ZOOM_STEPS,
  type Density,
  type Zoom,
} from "../../lib/prefs";
import { signInWithGitHub, signOutEverywhere } from "../../lib/auth";
import { deleteMyAccount } from "../../lib/account";
import { Blank, BlockSkeleton } from "../console/Chrome";
import Icon, { type IconName } from "../Icon";
import BlockedList from "./BlockedList";
import Onboarding from "./Onboarding";

interface BarView {
  tone: "idle" | "good" | "bad";
  text: string;
  acting: boolean;
}

export default function ProfileEditor() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [original, setOriginal] = useState<Profile | null>(null);
  const [pins, setPins] = useState<PinnedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<"saved" | "discarded" | null>(null);
  const [density, setDensity] = useState<Density>("comfortable");
  const [zoom, setZoom] = useState<Zoom>(100);
  const [closing, setClosing] = useState(false);
  const [tab, setTab] = useState<AreaId>(() => {
    if (typeof window === "undefined") return "profile";
    const asked = new URLSearchParams(window.location.search).get("area");
    return asked === "privacy" ||
      asked === "browser" ||
      asked === "account" ||
      asked === "profile"
      ? asked
      : "profile";
  });

  useEffect(() => {
    function heard(event: Event) {
      const detail = (event as CustomEvent<{ id: string; status: StatusId | null }>)
        .detail;
      if (!detail) return;
      setProfile((prev) =>
        prev && prev.id === detail.id ? { ...prev, status: detail.status } : prev,
      );
      setOriginal((prev) =>
        prev && prev.id === detail.id ? { ...prev, status: detail.status } : prev,
      );
    }
    window.addEventListener("exc:status", heard);
    return () => window.removeEventListener("exc:status", heard);
  }, []);
  const [closeError, setCloseError] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    setDensity(readDensity());
    setZoom(readZoom());
    void (async () => {
      const p = await loadMyProfile();
      setProfile(p);
      setOriginal(p);
      if (p) setPins(await loadPins(p.id));
      setLoading(false);
    })();
  }, []);

  const dirty =
    profile !== null &&
    original !== null &&
    (profile.display_name !== original.display_name ||
      profile.name_source !== original.name_source ||
      profile.bio !== original.bio ||
      profile.accent !== original.accent ||
      profile.banner_style !== original.banner_style ||
      profile.scans_public !== original.scans_public ||
      profile.private_account !== original.private_account ||
      profile.replies_public !== original.replies_public ||
      profile.banner_height !== original.banner_height ||
      profile.gradient_angle !== original.gradient_angle ||
      profile.accent_two !== original.accent_two ||
      profile.avatar_shape !== original.avatar_shape ||
      profile.status !== original.status);

  function showFlash(kind: "saved" | "discarded") {
    setFlash(kind);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1500);
  }

  function patch(next: Partial<Profile>) {
    setProfile((prev) => (prev ? { ...prev, ...next } : prev));
    setFlash(null);
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
      scans_public: profile.scans_public,
      banner_style: profile.banner_style,
      private_account: profile.private_account,
      replies_public: profile.replies_public,
      banner_height: profile.banner_height,
      gradient_angle: profile.gradient_angle,
      accent_two: profile.accent_two,
      avatar_shape: profile.avatar_shape,
      status: profile.status,
      onboarded_at: profile.onboarded_at ?? new Date().toISOString(),
    });

    setSaving(false);
    if (error) {
      setError(error);
      return;
    }
    setOriginal(profile);
    forgetScansPublic();
    showFlash("saved");
  }

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && !saving) void save();
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  });

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const visible = dirty || saving || flash !== null || error !== null;
  const live: BarView = error
    ? { tone: "bad", text: error, acting: true }
    : flash === "saved"
      ? { tone: "good", text: "Saved", acting: false }
      : flash === "discarded"
        ? { tone: "good", text: "Changes discarded", acting: false }
        : { tone: "idle", text: "You have unsaved changes", acting: true };

  const [held, setHeld] = useState<BarView | null>(null);
  useEffect(() => {
    setHeld(visible ? live : null);
  }, [visible, live.tone, live.text, live.acting]);

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
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void signInWithGitHub()}
          >
            Sign in with GitHub
          </button>
        }
      />
    );
  }

  if (!profile.onboarded_at) {
    return <Onboarding profile={profile} />;
  }

  const view = held ?? live;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-8">
        <nav className="flex flex-wrap gap-1.5">
          {AREAS.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => setTab(area.id)}
              aria-pressed={tab === area.id}
              className={tab === area.id ? "nav-pill nav-pill-active" : "nav-pill"}
            >
              <Icon name={area.icon} size={14} />
              {area.label}
            </button>
          ))}
        </nav>

        {tab === "profile" && (
        <Group
          title="Your profile"
          lead="How you appear to everyone else on the site."
        >
        <Section
          icon="user"
          title="Your name"
          lead={`This is the name on your posts, replies and scans. Your GitHub username @${profile.gh_login} stays beside it, always.`}
        >
          <div className="space-y-3">
            <ChoiceRow
              selected={profile.name_source === "github"}
              onSelect={() => patch({ name_source: "github" })}
              title="The name on my GitHub account"
              detail={profile.gh_name || profile.gh_login}
            />
            <ChoiceRow
              selected={profile.name_source === "custom"}
              onSelect={() => patch({ name_source: "custom" })}
              title="A name I choose"
              detail={profile.display_name?.trim() || "Nothing written yet"}
            />
          </div>

          {profile.name_source === "custom" && (
            <div className="mt-4">
              <label className="label" htmlFor="display-name">
                Your name
              </label>
              <input
                id="display-name"
                className="field"
                value={profile.display_name ?? ""}
                maxLength={40}
                placeholder="e.g. Berat"
                onChange={(e) => patch({ display_name: e.target.value })}
              />
              <Counter value={(profile.display_name ?? "").length} max={40} />
            </div>
          )}
        </Section>

        <Section
          icon="pencil"
          title="About you"
          lead="Optional. Shown on your public page."
        >
          <textarea
            className="field max-h-56 resize-y"
            rows={3}
            maxLength={280}
            value={profile.bio ?? ""}
            placeholder="What do you build, what are you into?"
            onChange={(e) => patch({ bio: e.target.value })}
          />
          <Counter value={(profile.bio ?? "").length} max={280} />
        </Section>

        <Section
          icon="palette"
          title="How your page looks"
          lead="A colour and a banner, both from a fixed set. Nothing is uploaded, so nothing can go wrong with it."
        >
          <div
            className="mb-5 rounded-[var(--radius-control)] border border-[var(--color-line)]"
            style={{
              height: bannerHeightPx(profile.banner_height) + 16,
              background: bannerLook({
                accent: profile.accent,
                accentTwo: profile.accent_two,
                style: profile.banner_style,
                angle: profile.gradient_angle,
                seed: profile.gh_login,
              }),
              backgroundSize: bannerSize(profile.banner_style),
            }}
          />

          <p className="label">Colour</p>
          <div className="flex flex-wrap gap-2.5">
            {ACCENTS.map((a) => {
              const active = profile.accent === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => patch({ accent: a.id as AccentId })}
                  aria-label={a.label}
                  aria-pressed={active}
                  title={a.label}
                  className={`grid size-9 place-items-center rounded-full border-2 transition ${
                    active
                      ? "scale-110 border-[var(--color-text)]"
                      : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: a.color }}
                >
                  {active && (
                    <Icon name="check" size={16} className="text-[#0a0912]" />
                  )}
                </button>
              );
            })}
          </div>

          <p className="label mt-6">Banner</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BANNER_STYLES.map((style) => {
              const active = profile.banner_style === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() =>
                    patch({ banner_style: style.id as BannerStyle })
                  }
                  aria-pressed={active}
                  className={`overflow-hidden rounded-[var(--radius-control)] border text-left transition ${
                    active
                      ? "border-[var(--color-line-active)]"
                      : "border-[var(--color-line)] hover:border-[var(--color-line-strong)]"
                  }`}
                >
                  <span
                    className="block h-12"
                    style={{
                      background: bannerLook({
                        accent: profile.accent,
                        accentTwo: profile.accent_two,
                        style: style.id as BannerStyle,
                        angle: profile.gradient_angle,
                        seed: profile.gh_login,
                      }),
                      backgroundSize: bannerSize(style.id as BannerStyle),
                    }}
                  />
                  <span className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    {style.label}
                    {active && (
                      <Icon
                        name="check"
                        size={13}
                        className="text-[var(--color-primary)]"
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="label mt-6">Second colour</p>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => patch({ accent_two: null })}
              aria-pressed={!profile.accent_two}
              title="Follow the first colour"
              className={`grid size-9 place-items-center rounded-full border-2 text-2xs transition ${
                !profile.accent_two
                  ? "scale-110 border-[var(--color-text)]"
                  : "border-transparent hover:scale-105"
              } bg-[var(--color-raised)] text-[var(--color-muted)]`}
            >
              Auto
            </button>
            {ACCENTS.map((a) => {
              const active = profile.accent_two === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => patch({ accent_two: a.id as AccentId })}
                  aria-label={a.label}
                  aria-pressed={active}
                  title={a.label}
                  className={`grid size-9 place-items-center rounded-full border-2 transition ${
                    active
                      ? "scale-110 border-[var(--color-text)]"
                      : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: a.color }}
                >
                  {active && (
                    <Icon name="check" size={16} className="text-[#0a0912]" />
                  )}
                </button>
              );
            })}
          </div>

          <p className="label mt-6">Gradient runs</p>
          <div className="flex flex-wrap gap-1.5">
            {GRADIENT_ANGLES.map((angle) => (
              <button
                key={angle.id}
                type="button"
                onClick={() =>
                  patch({ gradient_angle: angle.id as GradientAngle })
                }
                className={
                  profile.gradient_angle === angle.id
                    ? "nav-pill nav-pill-active"
                    : "nav-pill"
                }
              >
                {angle.label}
              </button>
            ))}
          </div>

          <p className="label mt-6">Banner height</p>
          <div className="flex flex-wrap gap-1.5">
            {BANNER_HEIGHTS.map((height) => (
              <button
                key={height.id}
                type="button"
                onClick={() =>
                  patch({ banner_height: height.id as BannerHeight })
                }
                className={
                  profile.banner_height === height.id
                    ? "nav-pill nav-pill-active"
                    : "nav-pill"
                }
              >
                {height.label}
              </button>
            ))}
          </div>

          <p className="label mt-6">Avatar shape</p>
          <div className="flex flex-wrap gap-1.5">
            {AVATAR_SHAPES.map((shape) => (
              <button
                key={shape.id}
                type="button"
                onClick={() => patch({ avatar_shape: shape.id as AvatarShape })}
                className={
                  profile.avatar_shape === shape.id
                    ? "nav-pill nav-pill-active"
                    : "nav-pill"
                }
              >
                {shape.label}
              </button>
            ))}
          </div>


          <p className="mt-6 text-2xs text-[var(--color-faint)]">
            Warm colours are missing on purpose. Amber and red mean "look at
            this" on a score here, so they are not yours to wear. The banner
            pattern also varies a little with your username, so two people who
            pick the same one do not look identical.
          </p>
        </Section>


        <PinSection profile={profile} pins={pins} onPins={setPins} />

        </Group>
        )}

        {tab === "privacy" && (
        <Group
          title="Privacy"
          lead="What other people can see of what you do here. Each of these applies to everything you have already done, not only what comes next."
        >
        <Section
          icon="shield"
          title="Your scan history"
          lead="A scan result you published describes the repository, so it stays. What you control here is whether your name is on it."
        >
          <div className="space-y-3">
            <ChoiceRow
              selected={profile.scans_public}
              onSelect={() => patch({ scans_public: true })}
              title="Everyone can see what I scan"
              detail="Your scans appear in the feed and on your public page, with your name."
            />
            <ChoiceRow
              selected={!profile.scans_public}
              onSelect={() => patch({ scans_public: false })}
              title="Only I can see what I scan"
              detail="The scan still counts for the repository, but nobody else sees it was you."
            />
          </div>
          {!profile.scans_public && (
            <p className="mt-3 text-2xs text-[var(--color-faint)]">
              Scans you already ran are covered too, and turning this back on
              brings your name back to all of them.
            </p>
          )}
        </Section>

        <Section
          icon="eye"
          title="Who can see you"
          lead="Off by default. Turning it on takes you out of the public side of the site."
        >
          <div className="space-y-3">
            <ChoiceRow
              selected={!profile.private_account}
              onSelect={() => patch({ private_account: false })}
              title="An open account"
              detail="Your posts and your page are part of the community."
            />
            <ChoiceRow
              selected={profile.private_account}
              onSelect={() => patch({ private_account: true })}
              title="A private account"
              detail="Your posts leave the public feed, and nobody can find you in search."
            />
          </div>
          {profile.private_account && (
            <p className="mt-3 text-2xs leading-relaxed text-[var(--color-faint)]">
              What this does not cover, so you are not surprised: replies you
              leave under someone else's scan stay where they are. Removing them
              would tear holes in a conversation other people are having. Delete
              a reply if you want it gone.
            </p>
          )}
        </Section>

        <Section
          icon="reply"
          title="Your replies"
          lead="Replies you leave under a scan or a post. They stay in the conversation either way; this is about whether they are gathered on your page."
        >
          <div className="space-y-3">
            <ChoiceRow
              selected={profile.replies_public}
              onSelect={() => patch({ replies_public: true })}
              title="List my replies on my page"
              detail="Anyone looking at your page can see what you have replied to."
            />
            <ChoiceRow
              selected={!profile.replies_public}
              onSelect={() => patch({ replies_public: false })}
              title="Keep my replies off my page"
              detail="Only you see them gathered. Each reply stays where you wrote it."
            />
          </div>
          {!profile.replies_public && (
            <p className="mt-3 text-2xs leading-relaxed text-[var(--color-faint)]">
              This hides the list, not the replies. Somebody reading the thread
              still sees what you wrote there, under your name. Delete a reply if
              you want it gone.
            </p>
          )}
        </Section>

        <Section
          icon="shield"
          title="People you have blocked"
          lead="Blocking drops the follow both ways, stops either of you writing, and takes you out of each other feeds. Nobody is told they were blocked."
        >
          <BlockedList />
        </Section>

        </Group>
        )}

        {tab === "browser" && (
        <Group
          title="This browser"
          lead="Kept on this device only. Nothing here is sent anywhere, and it does not follow you to another computer."
        >
        <Section
          icon="rows"
          title="How much fits on screen"
          lead="How tightly posts are stacked in the feed. Compact takes about a fifth off each row. Kept in this browser only, never sent anywhere."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  id: "comfortable",
                  title: "Comfortable",
                  detail: "Room to breathe.",
                },
                {
                  id: "compact",
                  title: "Compact",
                  detail: "More posts per screen.",
                },
              ] as const
            ).map((option) => (
              <ChoiceRow
                key={option.id}
                selected={density === option.id}
                onSelect={() => {
                  setDensity(option.id);
                  writeDensity(option.id);
                }}
                title={option.title}
                detail={option.detail}
              />
            ))}
          </div>
        </Section>

        <Section
          icon="sliders"
          title="Scale of the interface"
          lead="Makes everything on the page bigger or smaller, without touching your browser's own zoom. Desktop only, and kept in this browser."
        >
          <div className="hidden flex-wrap gap-1.5 lg:flex">
            {ZOOM_STEPS.map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => {
                  setZoom(step);
                  writeZoom(step);
                }}
                className={zoom === step ? "nav-pill nav-pill-active" : "nav-pill"}
              >
                {step}%
              </button>
            ))}
          </div>
          <p className="text-sm text-[var(--color-muted)] lg:hidden">
            This one is for wider screens. On a phone the page already fits itself
            to the display.
          </p>
        </Section>

        </Group>
        )}

        {tab === "account" && (
        <Group
          title="Your account"
          lead="Where your identity comes from, and how to leave."
        >
        <Section
          icon="github"
          title="Your picture and your account"
          lead="Both belong to GitHub. Nothing here can change them, and that is deliberate."
        >
          <div className="flex items-center gap-4">
            <Avatar
              src={profile.gh_avatar_url}
              name={shownName(profile)}
              accent={accentColor(profile.accent)}
              size={52}
            />
            <p className="min-w-0 text-xs text-[var(--color-muted)]">
              Change it on your{" "}
              <a
                href="https://github.com/settings/profile"
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                GitHub profile
              </a>
              , then sign out here and back in. Uploading is not possible:
              GitHub does the verifying, and moderation and bans stay on their
              side.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm mt-5"
            onClick={() => void signOutEverywhere()}
          >
            <Icon name="logout" size={14} />
            Sign out everywhere
          </button>
        </Section>

        <Section
          icon="trash"
          title="Close your account"
          lead="This removes your profile, posts, comments, follows, bookmarks and your GitHub sign-in. It happens straight away and cannot be undone."
        >
          {closing ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-text)]">
                Delete everything and sign you out?
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                Scan results you saved stay, because they describe a repository rather than you —
                but your name is detached from them.{" "}
                <a href="/app/takedown/" className="link">
                  Ask us
                </a>{" "}
                if you want those gone as well.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-[var(--color-bad)]"
                  onClick={() => {
                    setCloseError(null);
                    void deleteMyAccount().then((trouble) => {
                      if (trouble) setCloseError(trouble);
                      else window.location.href = "/";
                    });
                  }}
                >
                  Delete my account
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => setClosing(false)}
                >
                  Keep it
                </button>
              </div>
              {closeError && (
                <p className="text-xs text-[var(--color-bad)]">{closeError}</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm text-[var(--color-bad)]"
              onClick={() => setClosing(true)}
            >
              <Icon name="trash" size={14} />
              Delete my account
            </button>
          )}
        </Section>
        </Group>
        )}
      </div>

      <div
        className={`save-bar ${visible ? "save-bar-shown" : ""}`}
        role="status"
        aria-live="polite"
      >
        <span
          className={`flex min-w-[190px] items-center gap-2 px-1 text-sm ${
            view.tone === "good"
              ? "text-[var(--color-good)]"
              : view.tone === "bad"
                ? "text-[var(--color-bad)]"
                : "text-[var(--color-muted)]"
          }`}
        >
          {view.tone !== "idle" && (
            <Icon name={view.tone === "good" ? "check" : "cross"} size={16} />
          )}
          <span className="min-w-0 truncate">{view.text}</span>
        </span>

        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={!view.acting}
          onClick={() => {
            setProfile(original);
            setError(null);
            showFlash("discarded");
          }}
        >
          Discard
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!view.acting || saving}
          onClick={() => void save()}
        >
          {saving
            ? "Saving…"
            : view.tone === "bad"
              ? "Try again"
              : "Save changes"}
        </button>
      </div>

      <PreviewCard profile={profile} pins={pins} />
    </div>
  );
}

type AreaId = "profile" | "privacy" | "browser" | "account";

const AREAS: { id: AreaId; label: string; icon: IconName }[] = [
  { id: "profile", label: "Profile", icon: "user" },
  { id: "privacy", label: "Privacy", icon: "eye" },
  { id: "browser", label: "This browser", icon: "sliders" },
  { id: "account", label: "Account", icon: "github" },
];

function Group({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="px-1">
        <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
          {title}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
          {lead}
        </p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function Section({
  icon,
  title,
  lead,
  children,
}: {
  icon: IconName;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section className="surface p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] border border-[var(--color-line)] text-[var(--color-muted)]">
          <Icon name={icon} size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base">{title}</h2>
          {lead && (
            <p className="mt-1 text-xs text-[var(--color-muted)]">{lead}</p>
          )}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Counter({ value, max }: { value: number; max: number }) {
  const close = value > max * 0.9;
  return (
    <p
      className={`mt-1.5 text-right text-xs tabular-nums ${
        close ? "text-[var(--color-warn)]" : "text-[var(--color-faint)]"
      }`}
    >
      {value}/{max}
    </p>
  );
}

export function PinSection({
  profile,
  pins,
  onPins,
}: {
  profile: Profile;
  pins: PinnedRepo[];
  onPins: (pins: PinnedRepo[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const full = pins.length >= MAX_PINS;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const gone = new Set<string>();
      for (const pin of pins) {
        if (!(await repoResolves(pin.owner, pin.repo))) {
          gone.add(`${pin.owner}/${pin.repo}`);
        }
      }
      if (alive) setBroken(gone);
    })();
    return () => {
      alive = false;
    };
  }, [pins]);

  async function add() {
    const parsed = parseRepo(draft);
    if (!parsed) {
      setProblem("Write it as owner/repo, or paste the GitHub address.");
      return;
    }
    if (pins.some((p) => p.owner === parsed.owner && p.repo === parsed.repo)) {
      setProblem("That one is already pinned.");
      return;
    }
    setBusy(true);
    setProblem(null);

    const checked = await verifyRepo(parsed.owner, parsed.repo);
    if (checked.error) {
      setBusy(false);
      setProblem(checked.error);
      return;
    }
    if (
      pins.some((p) => p.owner === checked.owner && p.repo === checked.repo)
    ) {
      setBusy(false);
      setProblem("That one is already pinned.");
      return;
    }

    const { error } = await addPin(
      profile.id,
      checked.owner,
      checked.repo,
      note,
      pins.length,
    );
    setBusy(false);
    if (error) {
      setProblem(error);
      return;
    }
    onPins(await loadPins(profile.id));
    setDraft("");
    setNote("");
  }

  async function drop(pin: PinnedRepo) {
    const { error } = await removePin(profile.id, pin.owner, pin.repo);
    if (error) {
      setProblem(error);
      return;
    }
    onPins(await loadPins(profile.id));
  }

  async function move(index: number, by: -1 | 1) {
    const next = [...pins];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onPins(next);
    await reorderPins(profile.id, next);
  }

  return (
    <Section
      icon="pin"
      title="Repositories you look after"
      lead={`Up to ${MAX_PINS}, in the order you choose. They sit at the top of your public page. We check each one against GitHub, so only repositories you can push to can go here.`}
    >
      {pins.length > 0 && (
        <ul className="mb-5 space-y-2">
          {pins.map((pin, index) => (
            <li
              key={`${pin.owner}/${pin.repo}`}
              className="flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--color-line)] px-3.5 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <a
                  href={`/app/r/${pin.owner}/${pin.repo}/`}
                  className="block truncate font-mono text-sm text-[var(--color-text)] hover:underline"
                >
                  {pin.owner}/{pin.repo}
                </a>
                {broken.has(`${pin.owner}/${pin.repo}`) && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-[var(--color-warn)]">
                    <Icon name="info" size={11} />
                    GitHub no longer has this one. Visitors get a dead link.
                  </span>
                )}
                {pin.note && (
                  <span className="block truncate text-xs text-[var(--color-muted)]">
                    {pin.note}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <IconButton
                  label="Move up"
                  icon="up"
                  disabled={index === 0}
                  onClick={() => void move(index, -1)}
                />
                <IconButton
                  label="Move down"
                  icon="down"
                  disabled={index === pins.length - 1}
                  onClick={() => void move(index, 1)}
                />
                <IconButton
                  label="Unpin"
                  icon="trash"
                  onClick={() => void drop(pin)}
                />
              </span>
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className="text-xs text-[var(--color-faint)]">
          Three is the limit. Unpin one to make room for another.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="field"
              value={draft}
              placeholder="owner/repo"
              onChange={(e) => {
                setDraft(e.target.value);
                setProblem(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
            />
            <input
              className="field"
              value={note}
              maxLength={80}
              placeholder="Why it matters (optional)"
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
            />
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => void add()}
          >
            <Icon name="plus" size={14} />
            {busy ? "Pinning…" : "Pin it"}
          </button>
        </div>
      )}

      {problem && (
        <p className="mt-3 text-xs text-[var(--color-bad)]">{problem}</p>
      )}
    </Section>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-[var(--radius-control)] text-[var(--color-faint)] transition hover:bg-[rgba(163,145,224,0.08)] hover:text-[var(--color-text)] disabled:pointer-events-none disabled:opacity-30"
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

function PreviewCard({
  profile,
  pins,
}: {
  profile: Profile;
  pins: PinnedRepo[];
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const accent = accentColor(profile.accent);
  const publicPath = `/app/people/${profile.gh_login}/`;

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="surface overflow-hidden">
        <div
          style={{
            height: bannerHeightPx(profile.banner_height),
            background: bannerLook({
              accent: profile.accent,
              accentTwo: profile.accent_two,
              style: profile.banner_style,
              angle: profile.gradient_angle,
              seed: profile.gh_login,
            }),
            backgroundSize: bannerSize(profile.banner_style),
          }}
        />
        <div className="-mt-10 px-6 pb-6">
          <Avatar
            src={shownAvatar(profile)}
            name={shownName(profile)}
            accent={accent}
            size={72}
            shape={profile.avatar_shape}
            ring={4}
          />
          <p className="mt-3 flex items-center justify-center gap-1.5 text-base font-semibold">
            {shownName(profile)}
            {profile.verified && <Verified size={15} />}
          </p>
          <p className="font-mono text-xs text-[var(--color-muted)]">
            @{profile.gh_login}
          </p>
          {statusOf(profile.status) && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-2.5 py-1 text-xs text-[var(--color-muted)]">
              <span aria-hidden="true">{statusOf(profile.status)!.emoji}</span>
              {statusOf(profile.status)!.label}
            </p>
          )}
          {profile.bio?.trim() && (
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              {profile.bio}
            </p>
          )}

          {pins.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {pins.map((pin) => (
                <li
                  key={`${pin.owner}/${pin.repo}`}
                  className="flex items-center gap-2 truncate font-mono text-xs text-[var(--color-muted)]"
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                  {pin.owner}/{pin.repo}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-5 text-2xs uppercase tracking-wider text-[var(--color-faint)]">
            This is what everyone else sees
          </p>

          <div className="mt-3 space-y-2">
            <a href={publicPath} className="btn btn-ghost btn-sm w-full">
              <Icon name="external" size={14} />
              Open your public page
            </a>
            <button
              type="button"
              className="btn btn-quiet btn-sm w-full"
              onClick={() => {
                void navigator.clipboard
                  .writeText(`${window.location.origin}${publicPath}`)
                  .then(() => {
                    setCopied(true);
                    timer.current = window.setTimeout(
                      () => setCopied(false),
                      1600,
                    );
                  });
              }}
            >
              <Icon name={copied ? "check" : "copy"} size={14} />
              {copied ? "Link copied" : "Copy your link"}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function ChoiceRow({
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
          ? "border-[var(--color-line-active)] bg-[var(--color-primary-soft)]"
          : "border-[var(--color-line)] hover:border-[var(--color-line-strong)]"
      }`}
    >
      <span
        className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${
          selected
            ? "border-[var(--color-primary)]"
            : "border-[var(--color-line-strong)]"
        }`}
      >
        {selected && (
          <span className="size-2 rounded-full bg-[var(--color-primary)]" />
        )}
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
        <span className="block truncate text-xs text-[var(--color-muted)]">
          {detail}
        </span>
      </span>
    </button>
  );
}

export function Avatar({
  src,
  name,
  accent,
  size = 40,
  shape = "circle",
  ring = 0,
}: {
  src: string | null;
  name: string;
  accent?: string;
  size?: number;
  shape?: AvatarShape;
  ring?: number;
}) {
  const radius = avatarRadius(shape);
  const halo = ring
    ? {
        boxShadow: `0 0 0 ${ring}px var(--color-surface), 0 0 0 ${ring + 1}px var(--color-line-strong)`,
      }
    : null;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: radius, ...halo }}
        className="bg-[var(--color-raised)] object-cover"
      />
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: accent ?? "var(--color-primary)",
        ...halo,
      }}
      className="grid place-items-center font-semibold text-white"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
