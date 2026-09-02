import { supabase } from './supabase';
import { friendlyDbError } from './dbError';
import type { CommandId } from '../engine';

export type FeedKind = 'post' | 'report';

export interface FeedItem {
  kind: FeedKind;
  id: string;
  author_id: string | null;
  author_login: string | null;
  author_avatar: string | null;
  body: string | null;
  owner: string;
  repo: string;
  report_kind: CommandId | null;
  score: number | null;
  happened_at: string;
  likes: number;
  replies: number;
}

const COLUMNS =
  'kind, id, author_id, author_login, author_avatar, body, owner, repo, report_kind, score, happened_at, likes, replies';

export async function loadFeed(limit = 25, before?: string): Promise<FeedItem[]> {
  if (!supabase) return [];
  let query = supabase
    .from('feed')
    .select(COLUMNS)
    .order('happened_at', { ascending: false })
    .limit(limit);
  if (before) query = query.lt('happened_at', before);

  const { data, error } = await query;
  if (error) {
    console.warn('Could not load the feed:', error.message);
    return [];
  }
  return (data as unknown as FeedItem[]) ?? [];
}

export async function loadRepoFeed(owner: string, repo: string, limit = 25): Promise<FeedItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('feed')
    .select(COLUMNS)
    .eq('owner', owner)
    .eq('repo', repo)
    .order('happened_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('Could not load the feed:', error.message);
    return [];
  }
  return (data as unknown as FeedItem[]) ?? [];
}

export async function loadPost(id: string): Promise<FeedItem | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('feed')
    .select(COLUMNS)
    .eq('kind', 'post')
    .eq('id', id)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as FeedItem | null) ?? null;
}

export async function createPost(
  body: string,
  repo?: { owner: string; repo: string },
): Promise<{ id: string | null; error: string | null }> {
  if (!supabase) return { id: null, error: 'No connection.' };
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return { id: null, error: 'Sign in to post.' };

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: userId,
      body: body.trim(),
      repo_owner: repo?.owner ?? '',
      repo_name: repo?.repo ?? '',
    })
    .select('id')
    .single();

  if (error) return { id: null, error: friendlyDbError(error) };
  return { id: (data as { id: string }).id, error: null };
}

export async function deletePost(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('posts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

export async function loadMyLikes(items: FeedItem[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!supabase || items.length === 0) return out;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return out;

  const { data, error } = await supabase
    .from('votes')
    .select('target_type, target_id')
    .in('target_type', ['post', 'report'])
    .in(
      'target_id',
      items.map((i) => i.id),
    );
  if (error) return out;
  for (const row of (data ?? []) as { target_type: string; target_id: string }[]) {
    out.add(`${row.target_type}:${row.target_id}`);
  }
  return out;
}

export async function setLike(item: FeedItem, liked: boolean): Promise<string | null> {
  if (!supabase) return 'No connection.';
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return 'Sign in to like this.';

  if (!liked) {
    const { error } = await supabase
      .from('votes')
      .delete()
      .eq('user_id', userId)
      .eq('target_type', item.kind)
      .eq('target_id', item.id);
    return error ? friendlyDbError(error) : null;
  }

  const { error } = await supabase.from('votes').upsert(
    { user_id: userId, target_type: item.kind, target_id: item.id, value: 1 },
    { onConflict: 'user_id,target_type,target_id' },
  );
  return error ? friendlyDbError(error) : null;
}

export function itemHref(item: FeedItem): string {
  if (item.kind === 'post') return `/app/p/${item.id}/`;
  if (!item.report_kind) return '/app/';
  return item.repo
    ? `/app/r/${item.owner}/${item.repo}/${item.report_kind}/`
    : `/app/u/${item.owner}/${item.report_kind}/`;
}

export function targetHref(item: FeedItem): string | null {
  if (!item.owner) return null;
  return item.repo ? `/app/r/${item.owner}/${item.repo}/` : `/app/u/${item.owner}/`;
}

export function targetLabel(item: FeedItem): string | null {
  if (!item.owner) return null;
  return item.repo ? `${item.owner}/${item.repo}` : item.owner;
}
