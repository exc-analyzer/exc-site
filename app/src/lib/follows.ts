import { supabase } from "./supabase";
import { friendlyDbError } from "./dbError";

export interface FollowActivity {
  owner: string;
  repo: string;
  last_seen_at: string;
  created_at: string;
  score: number | null;
  report_count: number;
  last_report_at: string | null;
  new_reports: number;
  new_comments: number;
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function loadFollows(): Promise<FollowActivity[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("follow_activity")
    .select(
      "owner, repo, last_seen_at, created_at, score, report_count, last_report_at, new_reports, new_comments",
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Could not load follows:", error.message);
    return [];
  }
  return (data as FollowActivity[]) ?? [];
}

export function unreadTargets(rows: FollowActivity[]): number {
  return rows.filter((r) => r.new_reports > 0 || r.new_comments > 0).length;
}

export async function isFollowing(
  owner: string,
  repo: string,
): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("follows")
    .select("owner")
    .eq("owner", owner)
    .eq("repo", repo)
    .maybeSingle();
  if (error) return false;
  return data !== null;
}

export async function follow(
  owner: string,
  repo: string,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const userId = await currentUserId();
  if (!userId) return "Sign in to follow this.";
  const { error } = await supabase
    .from("follows")
    .insert({ user_id: userId, owner, repo });
  return error ? friendlyDbError(error) : null;
}

export async function unfollow(
  owner: string,
  repo: string,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("owner", owner)
    .eq("repo", repo);
  return error ? friendlyDbError(error) : null;
}

export async function markSeen(owner: string, repo: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("follows")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("owner", owner)
    .eq("repo", repo);
}

export async function markAllSeen(): Promise<void> {
  if (!supabase) return;
  const userId = await currentUserId();
  if (!userId) return;
  await supabase
    .from("follows")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("user_id", userId);
}
