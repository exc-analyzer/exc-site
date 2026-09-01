import { supabase } from './supabase';
import { friendlyDbError } from './dbError';
export interface Comment {
  id: string;
  report_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  vote_score: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  author?: { gh_login: string; avatar_url: string | null } | null;
}
export async function loadComments(reportId: string): Promise<Comment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('comments')
    .select('*, author:author_id (gh_login, avatar_url)')
    .eq('report_id', reportId)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('Could not load comments:', error.message);
    return [];
  }
  return (data as Comment[]) ?? [];
}
export async function postComment(
  reportId: string,
  body: string,
  parentId: string | null = null,
): Promise<{ comment: Comment | null; error: string | null }> {
  if (!supabase) return { comment: null, error: 'No connection.' };
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return { comment: null, error: 'Sign in to leave a comment.' };
  const { data, error } = await supabase
    .from('comments')
    .insert({ report_id: reportId, author_id: userId, parent_id: parentId, body: body.trim() })
    .select('*, author:author_id (gh_login, avatar_url)')
    .single();
  if (error) return { comment: null, error: friendlyDbError(error) };
  return { comment: data as Comment, error: null };
}
export async function softDeleteComment(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('comments')
    .update({ deleted_at: new Date().toISOString(), body: '[silindi]' })
    .eq('id', id);
  if (error) {
    console.warn('Yorum silinemedi:', error.message);
    return false;
  }
  return true;
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