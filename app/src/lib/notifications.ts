import { supabase } from './supabase';
import type { CommandId } from '../engine';

export interface Reply {
  id: string;
  body: string;
  created_at: string;
  from_id: string;
  from_login: string;
  from_avatar: string | null;
  post_id: string | null;
  report_id: string | null;
  on_what: 'post' | 'report' | 'comment';
  report_owner: string | null;
  report_repo: string | null;
  report_kind: CommandId | null;
}

const COLUMNS =
  'id, body, created_at, from_id, from_login, from_avatar, post_id, report_id, on_what, report_owner, report_repo, report_kind';

async function me(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function loadMyReplies(limit = 30): Promise<Reply[]> {
  if (!supabase) return [];
  const userId = await me();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('my_replies')
    .select(COLUMNS)
    .eq('to_id', userId)
    .neq('from_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('Could not load replies:', error.message);
    return [];
  }
  return (data as unknown as Reply[]) ?? [];
}

export async function lastSeenAt(): Promise<string | null> {
  if (!supabase) return null;
  const userId = await me();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('notifications_seen_at')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { notifications_seen_at: string }).notifications_seen_at;
}

export function unseen(replies: Reply[], since: string | null): number {
  if (!since) return 0;
  return replies.filter((r) => r.created_at > since).length;
}

export async function markSeen(): Promise<void> {
  if (!supabase) return;
  const userId = await me();
  if (!userId) return;
  await supabase
    .from('profiles')
    .update({ notifications_seen_at: new Date().toISOString() })
    .eq('id', userId);
}

export function replyHref(reply: Reply): string {
  if (reply.post_id) return `/app/p/${reply.post_id}/`;
  if (reply.report_owner && reply.report_kind) {
    return reply.report_repo
      ? `/app/r/${reply.report_owner}/${reply.report_repo}/${reply.report_kind}/`
      : `/app/u/${reply.report_owner}/${reply.report_kind}/`;
  }
  return '/app/';
}
