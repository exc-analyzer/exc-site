import { supabase } from './supabase';
import { friendlyDbError } from './dbError';
import type { FeedItem, FeedKind } from './feed';

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
    .from('people_follows')
    .select('followee_id')
    .eq('follower_id', userId)
    .eq('followee_id', followeeId)
    .maybeSingle();
  return data !== null;
}

export async function followPerson(followeeId: string): Promise<string | null> {
  if (!supabase) return 'No connection.';
  const userId = await me();
  if (!userId) return 'Sign in to follow people.';
  if (userId === followeeId) return 'You cannot follow yourself.';
  const { error } = await supabase
    .from('people_follows')
    .insert({ follower_id: userId, followee_id: followeeId });
  return error ? friendlyDbError(error) : null;
}

export async function unfollowPerson(followeeId: string): Promise<string | null> {
  if (!supabase) return 'No connection.';
  const userId = await me();
  if (!userId) return 'Sign in first.';
  const { error } = await supabase
    .from('people_follows')
    .delete()
    .eq('follower_id', userId)
    .eq('followee_id', followeeId);
  return error ? friendlyDbError(error) : null;
}

export async function followedIds(): Promise<string[]> {
  if (!supabase) return [];
  const userId = await me();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('people_follows')
    .select('followee_id')
    .eq('follower_id', userId);
  if (error) return [];
  return (data ?? []).map((row) => (row as { followee_id: string }).followee_id);
}

export async function loadMyBookmarks(items: FeedItem[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!supabase || items.length === 0) return out;
  const userId = await me();
  if (!userId) return out;
  const { data, error } = await supabase
    .from('bookmarks')
    .select('kind, target_id')
    .eq('user_id', userId)
    .in(
      'target_id',
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
  if (!supabase) return 'No connection.';
  const userId = await me();
  if (!userId) return 'Sign in to save this.';

  if (!saved) {
    const { error } = await supabase
      .from('bookmarks')
      .delete()
      .eq('user_id', userId)
      .eq('kind', kind)
      .eq('target_id', id);
    return error ? friendlyDbError(error) : null;
  }

  const { error } = await supabase
    .from('bookmarks')
    .insert({ user_id: userId, kind, target_id: id });
  return error ? friendlyDbError(error) : null;
}

export async function loadSaved(limit = 50): Promise<FeedItem[]> {
  if (!supabase) return [];
  const userId = await me();
  if (!userId) return [];

  const { data: rows, error } = await supabase
    .from('bookmarks')
    .select('kind, target_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !rows || rows.length === 0) return [];

  const ids = (rows as { target_id: string }[]).map((r) => r.target_id);
  const { data: items } = await supabase
    .from('feed')
    .select(
      'kind, id, author_id, author_login, author_avatar, body, owner, repo, report_kind, score, happened_at, edited_at, quote_id, quote_body, quote_login, likes, replies',
    )
    .in('id', ids);
  if (!items) return [];

  const order = new Map(ids.map((id, i) => [id, i]));
  return (items as unknown as FeedItem[]).sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
}
