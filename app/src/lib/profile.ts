import { supabase } from "./supabase";
import { friendlyDbError } from "./dbError";
export const ACCENTS = [
  { id: "indigo", label: "Indigo", color: "#6366f1", far: "#312e81" },
  { id: "violet", label: "Violet", color: "#8b5cf6", far: "#4c1d95" },
  { id: "fuchsia", label: "Fuchsia", color: "#d946ef", far: "#701a75" },
  { id: "pink", label: "Pink", color: "#ec4899", far: "#831843" },
  { id: "sky", label: "Sky", color: "#38bdf8", far: "#0c4a6e" },
  { id: "cyan", label: "Cyan", color: "#22d3ee", far: "#164e63" },
  { id: "teal", label: "Teal", color: "#2dd4bf", far: "#134e4a" },
  { id: "emerald", label: "Emerald", color: "#34d399", far: "#064e3b" },
  { id: "slate", label: "Slate", color: "#94a3b8", far: "#334155" },
] as const;

export const BANNER_STYLES = [
  { id: "glow", label: "Glow" },
  { id: "mesh", label: "Mesh" },
  { id: "beam", label: "Beam" },
  { id: "grid", label: "Grid" },
  { id: "wave", label: "Wave" },
  { id: "noise", label: "Noise" },
] as const;

export const BANNER_HEIGHTS = [
  { id: "slim", label: "Slim", px: 56 },
  { id: "normal", label: "Normal", px: 80 },
  { id: "tall", label: "Tall", px: 120 },
] as const;

export const GRADIENT_ANGLES = [
  { id: "diagonal", label: "Diagonal", deg: 135 },
  { id: "horizontal", label: "Across", deg: 90 },
  { id: "vertical", label: "Down", deg: 180 },
] as const;

export const AVATAR_SHAPES = [
  { id: "circle", label: "Circle" },
  { id: "rounded", label: "Rounded" },
  { id: "hex", label: "Hex" },
] as const;

export const STATUSES = [
  { id: "open-to-contributors", emoji: "\u{1F91D}", label: "Open to contributors" },
  { id: "reviewing", emoji: "\u{1F50D}", label: "Happy to review" },
  { id: "building", emoji: "\u{1F528}", label: "Heads down building" },
  { id: "learning", emoji: "\u{1F331}", label: "Learning" },
  { id: "busy", emoji: "\u{1F311}", label: "Busy right now" },
  { id: "away", emoji: "\u{1F4A4}", label: "Away" },
] as const;

export type BannerHeight = (typeof BANNER_HEIGHTS)[number]["id"];
export type GradientAngle = (typeof GRADIENT_ANGLES)[number]["id"];
export type AvatarShape = (typeof AVATAR_SHAPES)[number]["id"];
export type StatusId = (typeof STATUSES)[number]["id"];

export type BannerStyle = (typeof BANNER_STYLES)[number]["id"];

export type AccentId = (typeof ACCENTS)[number]["id"];
export type SourceChoice = "github" | "custom";
export interface Profile {
  id: string;
  gh_login: string;
  gh_name: string | null;
  gh_avatar_url: string | null;
  display_name: string | null;
  name_source: SourceChoice;
  bio: string | null;
  accent: AccentId;
  banner_style: BannerStyle;
  banner_height: BannerHeight;
  gradient_angle: GradientAngle;
  accent_two: AccentId | null;
  avatar_shape: AvatarShape;
  status: StatusId | null;
  scans_public: boolean;
  private_account: boolean;
  replies_public: boolean;
  verified: boolean;
  gh_created_at: string | null;
  reputation: number;
  created_at: string;
  onboarded_at: string | null;
}
export interface NameParts {
  name_source: SourceChoice;
  display_name: string | null;
  gh_name: string | null;
  gh_login: string;
}
export function shownName(p: NameParts): string {
  if (p.name_source === "custom" && p.display_name?.trim())
    return p.display_name;
  return p.gh_name?.trim() || p.gh_login;
}

export function shownAvatar(p: Profile): string | null {
  return p.gh_avatar_url;
}
export function accentColor(id: AccentId): string {
  return ACCENTS.find((a) => a.id === id)?.color ?? "#6366f1";
}

function accentFar(id: AccentId): string {
  return ACCENTS.find((a) => a.id === id)?.far ?? "#312e81";
}

function seedOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export interface Look {
  accent: AccentId;
  accentTwo?: AccentId | null;
  style: BannerStyle;
  angle?: GradientAngle;
  seed?: string;
}

export function bannerHeightPx(height: BannerHeight): number {
  return BANNER_HEIGHTS.find((h) => h.id === height)?.px ?? 80;
}

function angleDeg(angle: GradientAngle | undefined): number {
  return GRADIENT_ANGLES.find((a) => a.id === angle)?.deg ?? 135;
}

export function bannerLook(look: Look): string {
  const near = accentColor(look.accent);
  const far = look.accentTwo
    ? accentColor(look.accentTwo)
    : accentFar(look.accent);
  const deg = angleDeg(look.angle);
  const n = look.seed ? seedOf(look.seed) : 0;

  switch (look.style) {
    case "wave": {
      const lift = 40 + (n % 25);
      const drop = 55 + ((n >> 3) % 25);
      return [
        `radial-gradient(120% 80% at ${lift}% 120%, ${near}55, transparent 60%)`,
        `radial-gradient(120% 70% at ${drop}% -20%, ${far}88, transparent 62%)`,
        `linear-gradient(${deg}deg, ${near}30, ${far}66)`,
      ].join(", ");
    }
    case "noise": {
      const a = 10 + (n % 70);
      const b = 15 + ((n >> 4) % 70);
      const c = 20 + ((n >> 8) % 70);
      return [
        `radial-gradient(28% 60% at ${a}% 30%, ${near}4d, transparent 70%)`,
        `radial-gradient(24% 55% at ${b}% 75%, ${far}66, transparent 72%)`,
        `radial-gradient(30% 65% at ${c}% 10%, ${near}33, transparent 70%)`,
        `linear-gradient(${deg}deg, rgba(10,9,18,0.7), ${far}59)`,
      ].join(", ");
    }
    default:
      return bannerBackground(look.accent, look.style, look.accentTwo, deg);
  }
}

export function bannerBackground(
  accent: AccentId,
  style: BannerStyle,
  second?: AccentId | null,
  deg = 135,
): string {
  const near = accentColor(accent);
  const far = second ? accentColor(second) : accentFar(accent);

  switch (style) {
    case "mesh":
      return [
        `radial-gradient(60% 130% at 12% 15%, ${near}55, transparent 68%)`,
        `radial-gradient(50% 120% at 82% 30%, ${far}88, transparent 70%)`,
        `radial-gradient(70% 160% at 55% 120%, ${near}33, transparent 72%)`,
        "linear-gradient(120deg, rgba(10,9,18,0.5), rgba(10,9,18,0.9))",
      ].join(", ");
    case "beam":
      return [
        `linear-gradient(104deg, transparent 8%, ${near}4d 26%, transparent 42%)`,
        `linear-gradient(104deg, transparent 44%, ${near}2e 58%, transparent 70%)`,
        `linear-gradient(150deg, ${far}b3, rgba(10,9,18,0.85))`,
      ].join(", ");
    case "grid":
      return [
        "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)",
        "linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)",
        `radial-gradient(80% 150% at 20% 0%, ${near}40, transparent 70%)`,
        `linear-gradient(140deg, ${far}99, rgba(10,9,18,0.9))`,
      ].join(", ");
    default:
      return [
        `radial-gradient(85% 150% at 12% -10%, ${near}cc, transparent 60%)`,
        `radial-gradient(70% 130% at 92% 110%, ${far}99, transparent 64%)`,
        `linear-gradient(${deg}deg, ${near}80, ${far}6b)`,
      ].join(", ");
  }
}

export function bannerSize(style: BannerStyle): string | undefined {
  return style === "grid" ? "22px 22px, 22px 22px, auto, auto" : undefined;
}

export function avatarRadius(shape: AvatarShape): string {
  if (shape === "rounded") return "28%";
  if (shape === "hex") return "18%";
  return "9999px";
}

export function statusOf(id: StatusId | null | undefined) {
  return id ? (STATUSES.find((s) => s.id === id) ?? null) : null;
}
const PROFILE_CACHE_KEY = 'exc.profile';

export function cachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function probablySignedIn(): boolean {
  return cachedProfile() !== null;
}

export function rememberProfile(profile: Profile | null): void {
  try {
    if (profile) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {}
}


export async function loadMyProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    rememberProfile(null);
    return null;
  }
  const { data, error } = await supabase.rpc("my_profile");
  const row = (data as Profile[] | null)?.[0];
  if (error || !row) return null;
  const profile = row;

  const meta = session.user.user_metadata ?? {};
  const patch: Record<string, string> = {};
  if (!profile.gh_avatar_url && typeof meta.avatar_url === "string") {
    patch.gh_avatar_url = meta.avatar_url;
  }
  if (!profile.gh_name && typeof meta.full_name === "string") {
    patch.gh_name = meta.full_name;
  }

  if (Object.keys(patch).length > 0) {
    Object.assign(profile, patch);
    const { error: writeBack } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", session.user.id);
    if (writeBack) {
      console.warn("Could not store the GitHub name:", writeBack.message);
    }
  }
  rememberProfile(profile);
  return profile;
}
let scansPublicAnswer: Promise<boolean> | null = null;

export function myScansPublic(): Promise<boolean> {
  if (!scansPublicAnswer) {
    scansPublicAnswer = (async () => {
      if (!supabase) return true;
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return true;
      const { data, error } = await supabase
        .from("profiles")
        .select("scans_public")
        .eq("id", userId)
        .maybeSingle();
      if (error || !data) return true;
      return (data as { scans_public: boolean }).scans_public;
    })();
  }
  return scansPublicAnswer;
}

export function forgetScansPublic(): void {
  scansPublicAnswer = null;
}

export interface ProfilePatch {
  display_name?: string | null;
  name_source?: SourceChoice;
  bio?: string | null;
  accent?: AccentId;
  banner_height?: BannerHeight;
  gradient_angle?: GradientAngle;
  accent_two?: AccentId | null;
  avatar_shape?: AvatarShape;
  status?: StatusId | null;
  banner_style?: BannerStyle;
  scans_public?: boolean;
  private_account?: boolean;
  replies_public?: boolean;
  onboarded_at?: string;
}
export async function saveMyProfile(
  patch: ProfilePatch,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: "No connection." };

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return { error: "Not signed in." };
  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId);
  if (!error) {
    const known = cachedProfile();
    if (known) rememberProfile({ ...known, ...patch } as Profile);
  }
  return { error: friendlyDbError(error) };
}
