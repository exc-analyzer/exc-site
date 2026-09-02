import { supabase } from './supabase';
import { friendlyDbError } from './dbError';

export type AbuseTarget = 'comment' | 'profile' | 'report' | 'post';

export async function reportAbuse(
  targetType: AbuseTarget,
  targetId: string,
  reason: string,
): Promise<string | null> {
  if (!supabase) return 'No connection.';
  const trimmed = reason.trim();
  if (trimmed.length < 3) return 'Say a little more about what is wrong.';

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return 'Sign in to report something.';

  const { error } = await supabase.from('abuse_reports').insert({
    target_type: targetType,
    target_id: targetId,
    reporter_id: userId,
    reason: trimmed,
  });

  if (!error) return null;
  return error.code === '23505' ? 'You already reported this.' : friendlyDbError(error);
}
