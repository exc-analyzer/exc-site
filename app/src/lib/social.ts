import { supabase } from "./supabase";
import { friendlyDbError } from "./dbError";
import type { FeedItem, FeedKind } from "./feed";
import type { AccentId } from "./profile";

async function me(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function isFollowingPerson(followeeId: string): Promise<boolean> {
  if (!supabase) return false;
  const userId = await me();
  if (!userId) return false;
  const { data } = await supabase
    .from("people_follows")
    .select("followee_id")
    .eq("follower_id", userId)
    .eq("followee_id", followeeId)
    .maybeSingle();
  return data !== null;
}

export async function followPerson(followeeId: string): Promise<string | null> {
  if (!supabase) return "No connection.";
  const userId = await me();
  if (!userId) return "Sign in to follow people.";
  if (userId === followeeId) return "You cannot follow yourself.";
  const { error } = await supabase
    .from("people_follows")
    .insert({ follower_id: userId, followee_id: followeeId });
  return error ? friendlyDbError(error) : null;
}

export async function unfollowPerson(
  followeeId: string,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const userId = await me();
  if (!userId) return "Sign in first.";
  const { error } = await supabase
    .from("people_follows")
    .delete()
    .eq("follower_id", userId)
    .eq("followee_id", followeeId);
  return error ? friendlyDbError(error) : null;
}

export async function followedIds(): Promise<string[]> {
  if (!supabase) return [];
  const userId = await me();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("people_follows")
    .select("followee_id")
    .eq("follower_id", userId);
  if (error) return [];
  return (data ?? []).map(
    (row) => (row as { followee_id: string }).followee_id,
  );
}

export async function loadMyBookmarks(items: FeedItem[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!supabase || items.length === 0) return out;
  const userId = await me();
  if (!userId) return out;
  const { data, error } = await supabase
    .from("bookmarks")
    .select("kind, target_id")
    .eq("user_id", userId)
    .in(
      "target_id",
      items.map((i) => i.id),
    );
  if (error) return out;
  for (const row of (data ?? []) as { kind: string; target_id: string }[]) {
    out.add(`${row.kind}:${row.target_id}`);
  }
  return out;
}

export async function setBookmark(
  kind: FeedKind,
  id: string,
  saved: boolean,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const userId = await me();
  if (!userId) return "Sign in to save this.";

  if (!saved) {
    const { error } = await supabase
      .from("bookmarks")
      .delete()
      .eq("user_id", userId)
      .eq("kind", kind)
      .eq("target_id", id);
    return error ? friendlyDbError(error) : null;
  }

  const { error } = await supabase
    .from("bookmarks")
    .insert({ user_id: userId, kind, target_id: id });
  return error ? friendlyDbError(error) : null;
}

export async function loadSaved(limit = 50): Promise<FeedItem[]> {
  if (!supabase) return [];
  const userId = await me();
  if (!userId) return [];

  const { data: rows, error } = await supabase
    .from("bookmarks")
    .select("kind, target_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !rows || rows.length === 0) return [];

  const ids = (rows as { target_id: string }[]).map((r) => r.target_id);
  const { data: items } = await supabase
    .from("feed")
    .select(
      "kind, id, author_id, author_login, author_name, author_avatar, author_accent, author_accent_two, author_shape, visibility, body, owner, repo, report_kind, score, happened_at, edited_at, quote_id, quote_body, quote_login, likes, replies, author_verified",
    )
    .in("id", ids);
  if (!items) return [];

  const order = new Map(ids.map((id, i) => [id, i]));
  return (items as unknown as FeedItem[]).sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
}

export interface FollowRequest {
  from_id: string;
  created_at: string;
  gh_login: string;
  avatar_url: string | null;
  accent: AccentId;
  shown_name: string;
  verified: boolean;
}

export async function requestFollow(personId: string): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { data: sessionData } = await supabase.auth.getSession();
  const me = sessionData.session?.user.id;
  if (!me) return "Sign in first.";
  const { error } = await supabase
    .from("follow_requests")
    .insert({ from_id: me, to_id: personId });
  return error ? friendlyDbError(error) : null;
}

export async function cancelFollowRequest(personId: string): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { data: sessionData } = await supabase.auth.getSession();
  const me = sessionData.session?.user.id;
  if (!me) return "Sign in first.";
  const { error } = await supabase
    .from("follow_requests")
    .delete()
    .eq("from_id", me)
    .eq("to_id", personId);
  return error ? friendlyDbError(error) : null;
}

export async function hasPendingRequest(personId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data: sessionData } = await supabase.auth.getSession();
  const me = sessionData.session?.user.id;
  if (!me) return false;
  const { data } = await supabase
    .from("follow_requests")
    .select("from_id")
    .eq("from_id", me)
    .eq("to_id", personId)
    .maybeSingle();
  return Boolean(data);
}

export async function loadFollowRequests(): Promise<FollowRequest[]> {
  if (!supabase) return [];
  const { data: sessionData } = await supabase.auth.getSession();
  const me = sessionData.session?.user.id;
  if (!me) return [];
  const { data, error } = await supabase
    .from("follow_request_inbox")
    .select("from_id, created_at, gh_login, avatar_url, accent, shown_name, verified")
    .eq("to_id", me)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as unknown as FollowRequest[]) ?? [];
}

export async function acceptFollowRequest(fromId: string): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("accept_follow_request", { requester: fromId });
  return error ? friendlyDbError(error) : null;
}

export async function declineFollowRequest(fromId: string): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { data: sessionData } = await supabase.auth.getSession();
  const me = sessionData.session?.user.id;
  if (!me) return "Sign in first.";
  const { error } = await supabase
    .from("follow_requests")
    .delete()
    .eq("from_id", fromId)
    .eq("to_id", me);
  return error ? friendlyDbError(error) : null;
}

export interface FollowNews {
  id: string;
  other_id: string;
  gh_login: string;
  shown_name: string;
  avatar_url: string | null;
  accent: AccentId;
  avatar_shape: string;
  kind: "accepted" | "followed";
  at: string;
  seen: boolean;
  mutual: boolean;
  verified: boolean;
}

export async function loadFollowNews(): Promise<FollowNews[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("my_follow_news");
  if (error) return [];
  return (data as unknown as FollowNews[]) ?? [];
}

export async function markFollowNewsSeen(): Promise<void> {
  if (!supabase) return;
  await supabase.rpc("mark_follow_news_seen");
}
