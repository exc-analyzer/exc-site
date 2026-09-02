import { supabase } from './supabase';
import { friendlyDbError } from './dbError';
export type CommentTarget = { kind: 'report' | 'post'; id: string };

export interface Comment {
  id: string;
  report_id: string | null;
  post_id: string | null;
  author_id: string;
  parent_id: string | null;
  body: string;
  vote_score: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  author?: { gh_login: string; avatar_url: string | null } | null;
}
export async function loadComments(target: CommentTarget): Promise<Comment[]> {
  if (!supabase) return [];
  const column = target.kind === 'post' ? 'post_id' : 'report_id';
  const { data, error } = await supabase
    .from('comments')
    .select('*, author:author_id (gh_login, avatar_url)')
    .eq(column, target.id)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('Could not load comments:', error.message);
    return [];
  }
  return (data as Comment[]) ?? [];
}
export async function postComment(
  target: CommentTarget,
  body: string,
  parentId: string | null = null,
): Promise<{ comment: Comment | null; error: string | null }> {
  if (!supabase) return { comment: null, error: 'No connection.' };
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return { comment: null, error: 'Sign in to leave a comment.' };
  const link = target.kind === 'post' ? { post_id: target.id } : { report_id: target.id };
  const { data, error } = await supabase
    .from('comments')
    .insert({ ...link, author_id: userId, parent_id: parentId, body: body.trim() })
    .select('*, author:author_id (gh_login, avatar_url)')
    .single();
  if (error) return { comment: null, error: friendlyDbError(error) };
  return { comment: data as Comment, error: null };
}
export async function softDeleteComment(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('comments')
    .update({ deleted_at: new Date().toISOString(), body: '[removed]' })
    .eq('id', id);
  if (error) {
    console.warn('Could not delete comment:', error.message);
    return false;
  }
  return true;
}
export interface RepoComment {
  id: string;
  body: string;
  created_at: string;
  report_id: string;
  deleted_at: string | null;
  author?: { gh_login: string; avatar_url: string | null } | null;
  report?: { owner: string; repo: string; kind: string } | null;
}
export async function loadRepoComments(
  owner: string,
  repo: string,
  limit = 8,
): Promise<RepoComment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('comments')
    .select(
      'id, body, created_at, report_id, deleted_at, author:author_id (gh_login, avatar_url), report:report_id!inner (owner, repo, kind)',
    )
    .eq('report.owner', owner)
    .eq('report.repo', repo)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('Could not load discussion:', error.message);
    return [];
  }
  return (data as unknown as RepoComment[]) ?? [];
}
export type VoteValue = -1 | 0 | 1;
export async function loadMyVotes(commentIds: string[]): Promise<Map<string, VoteValue>> {
  const out = new Map<string, VoteValue>();
  if (!supabase || commentIds.length === 0) return out;

  const { data, error } = await supabase
    .from('votes')
    .select('target_id, value')
    .eq('target_type', 'comment')
    .in('target_id', commentIds);
  if (error) return out;
  for (const row of (data ?? []) as { target_id: string; value: VoteValue }[]) {
    out.set(row.target_id, row.value);
  }
  return out;
}
export async function voteComment(commentId: string, value: VoteValue): Promise<boolean> {
  if (!supabase) return false;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return false;
  if (value === 0) {
    const { error } = await supabase
      .from('votes')
      .delete()
      .eq('user_id', userId)
      .eq('target_type', 'comment')
      .eq('target_id', commentId);
    return !error;
  }
  const { error } = await supabase
    .from('votes')
    .upsert(
      { user_id: userId, target_type: 'comment', target_id: commentId, value },
      { onConflict: 'user_id,target_type,target_id' },
    );
  return !error;
}