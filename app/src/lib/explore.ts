import { supabase } from './supabase';
import type { CommandId } from '../engine';

export interface ExploreRow {
  owner: string;
  repo: string;
  kind: CommandId;
  score: number | null;
  scan_count: number;
  updated_at: string;
  first_score: number | null;
  improvement: number | null;
  replies: number;
  likes: number;
}

const COLUMNS =
  'owner, repo, kind, score, scan_count, updated_at, first_score, improvement, replies, likes';

function base() {
  return supabase?.from('explore').select(COLUMNS) ?? null;
}

async function take(
  query: ReturnType<typeof base>,
): Promise<ExploreRow[]> {
  if (!query) return [];
  const { data, error } = await query;
  if (error) {
    console.warn('Could not load the lists:', error.message);
    return [];
  }
  return (data as unknown as ExploreRow[]) ?? [];
}

export function bestDefended(limit = 8): Promise<ExploreRow[]> {
  return take(
    base()
      ?.eq('kind', 'security-score')
      .not('score', 'is', null)
      .order('score', { ascending: false })
      .order('scan_count', { ascending: false })
      .limit(limit) ?? null,
  );
}

export function mostImproved(limit = 8): Promise<ExploreRow[]> {
  return take(
    base()
      ?.eq('kind', 'security-score')
      .gt('improvement', 0)
      .order('improvement', { ascending: false })
      .limit(limit) ?? null,
  );
}

export function mostScanned(limit = 8): Promise<ExploreRow[]> {
  return take(
    base()
      ?.order('scan_count', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit) ?? null,
  );
}

export function mostDiscussed(limit = 8): Promise<ExploreRow[]> {
  return take(
    base()?.gt('replies', 0).order('replies', { ascending: false }).limit(limit) ?? null,
  );
}

export function repoHref(row: ExploreRow): string {
  return `/app/r/${row.owner}/${row.repo}/`;
}
