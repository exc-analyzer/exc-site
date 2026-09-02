import { supabase } from './supabase';
import type { FeedItem } from './feed';
import type { AccentId } from './profile';

export interface Member {
  id: string;
  gh_login: string;
  avatar_url: string | null;
  accent: AccentId;
  bio: string | null;
  created_at: string;
  shown_name: string;
  post_count: number;
  scan_count: number;
  comment_count: number;
}

const MEMBER_COLUMNS =
  'id, gh_login, avatar_url, accent, bio, created_at, shown_name, post_count, scan_count, comment_count';

export async function loadMember(login: string): Promise<Member | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('member_profile')
    .select(MEMBER_COLUMNS)
    .eq('gh_login', login)
    .maybeSingle();
  if (error) {
    console.warn('Could not load the member:', error.message);
    return null;
  }
  return (data as unknown as Member | null) ?? null;
}

export async function loadMemberFeed(authorId: string, limit = 25): Promise<FeedItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('feed')
    .select(
      'kind, id, author_id, author_login, author_avatar, body, owner, repo, report_kind, score, happened_at, likes, replies',
    )
    .eq('author_id', authorId)
    .order('happened_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('Could not load their activity:', error.message);
    return [];
  }
  return (data as unknown as FeedItem[]) ?? [];
}

export function memberHref(login: string | null | undefined): string | null {
  return login ? `/app/people/${login}/` : null;
}
