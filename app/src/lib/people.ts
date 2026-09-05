import { supabase } from "./supabase";
import { friendlyDbError } from "./dbError";
import type { FeedItem } from "./feed";
import type {
  AccentId,
  AvatarShape,
  BannerHeight,
  BannerStyle,
  GradientAngle,
  StatusId,
} from "./profile";

export interface Member {
  id: string;
  gh_login: string;
  avatar_url: string | null;
  accent: AccentId;
  banner_style: BannerStyle;
  scans_public: boolean;
  private_account: boolean;
  verified: boolean;
  replies_public: boolean;
  banner_height: BannerHeight;
  gradient_angle: GradientAngle;
  accent_two: AccentId | null;
  avatar_shape: AvatarShape;
  status: StatusId | null;
  bio: string | null;
  created_at: string;
  shown_name: string;
  post_count: number;
  scan_count: number;
  comment_count: number;
  follower_count: number;
  following_count: number;
}

export const MEMBER_COLUMNS =
  "id, gh_login, avatar_url, accent, banner_style, banner_height, gradient_angle, accent_two, avatar_shape, status, scans_public, private_account, replies_public, bio, created_at, shown_name, post_count, scan_count, comment_count, follower_count, following_count, verified";

export async function loadMember(login: string): Promise<Member | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("member_profile")
    .select(MEMBER_COLUMNS)
    .eq("gh_login", login)
    .maybeSingle();
  if (error) {
    console.warn("Could not load the member:", error.message);
    return null;
  }
  return (data as unknown as Member | null) ?? null;
}

export async function searchMembers(
  term: string,
  limit = 5,
): Promise<Member[]> {
  if (!supabase) return [];
  const safe = term
    .trim()
    .replace(/[%,()]/g, " ")
    .trim();
  if (!safe) return [];
  const { data, error } = await supabase
    .from("member_profile")
    .select(MEMBER_COLUMNS)
    .or(`gh_login.ilike.%${safe}%,shown_name.ilike.%${safe}%`)
    .order("follower_count", { ascending: false })
    .order("post_count", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("Could not search people:", error.message);
    return [];
  }
  return (data as unknown as Member[]) ?? [];
}

export async function loadMemberFeed(
  authorId: string,
  limit = 25,
): Promise<FeedItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("feed")
    .select(
      "kind, id, author_id, author_login, author_name, author_avatar, author_accent, author_accent_two, author_shape, visibility, body, owner, repo, report_kind, score, happened_at, edited_at, quote_id, quote_body, quote_login, likes, replies, author_verified",
    )
    .eq("author_id", authorId)
    .order("happened_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("Could not load their activity:", error.message);
    return [];
  }
  return (data as unknown as FeedItem[]) ?? [];
}

export interface MemberReply {
  id: string;
  body: string;
  created_at: string;
  on_what: "post" | "report" | "comment";
  post_id: string | null;
  report_id: string | null;
  report_owner: string | null;
  report_repo: string | null;
  report_kind: string | null;
}

export async function loadMemberReplies(
  memberId: string,
  limit = 25,
): Promise<MemberReply[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("member_replies", {
    member: memberId,
    lim: limit,
  });
  if (error) {
    console.warn("Could not load their replies:", error.message);
    return [];
  }
  return (data as unknown as MemberReply[]) ?? [];
}

async function membersByIds(ids: string[]): Promise<Member[]> {
  if (!supabase || ids.length === 0) return [];
  const { data, error } = await supabase
    .from("member_profile")
    .select(MEMBER_COLUMNS)
    .in("id", ids);
  if (error) return [];
  return (data as unknown as Member[]) ?? [];
}

export async function loadFollowers(
  memberId: string,
  limit = 50,
): Promise<Member[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("people_follows")
    .select("follower_id")
    .eq("followee_id", memberId)
    .limit(limit);
  if (error) return [];
  return membersByIds(
    (data as { follower_id: string }[]).map((row) => row.follower_id),
  );
}

export async function loadFollowing(
  memberId: string,
  limit = 50,
): Promise<Member[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("people_follows")
    .select("followee_id")
    .eq("follower_id", memberId)
    .limit(limit);
  if (error) return [];
  return membersByIds(
    (data as { followee_id: string }[]).map((row) => row.followee_id),
  );
}

export async function removeFollower(followerId: string): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { data: sessionData } = await supabase.auth.getSession();
  const me = sessionData.session?.user.id;
  if (!me) return "Sign in first.";

  const { error } = await supabase
    .from("people_follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("followee_id", me);
  return error ? friendlyDbError(error) : null;
}

export function memberHref(login: string | null | undefined): string | null {
  return login ? `/app/people/${login}/` : null;
}
