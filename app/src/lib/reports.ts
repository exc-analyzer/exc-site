import { supabase } from './supabase';
import { getCommand, type CommandId, type CommandResult } from '../engine';
export interface StoredReport {
  id: string;
  owner: string;
  repo: string;
  kind: CommandId;
  score: number | null;
  summary: unknown;
  scan_count: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  profiles?: { gh_login: string; avatar_url: string | null } | null;
}
export interface ReportTarget {
  owner: string;
  repo: string;
  score: number | null;
}
export function reportTarget(result: CommandResult): ReportTarget | null {
  switch (result.id) {
    case 'dork-scan':
      return null;
    case 'user-analysis':
      return { owner: result.data.login, repo: '', score: null };
    case 'user-anomaly':
      return { owner: result.data.login, repo: '', score: result.data.riskScore };
    case 'security-score':
      return { owner: result.data.owner, repo: result.data.repo, score: result.data.score };
    default:
      return { owner: result.data.owner, repo: result.data.repo, score: null };
  }
}
export function reportPath(owner: string, repo: string, kind: CommandId): string | null {
  if (getCommand(kind).sensitive) return null;
  return repo ? `/app/r/${owner}/${repo}/${kind}/` : `/app/u/${owner}/${kind}/`;
}
export async function saveReport(result: CommandResult): Promise<StoredReport | null> {
  if (!supabase) return null;
  if (getCommand(result.id).sensitive) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;

  const target = reportTarget(result);
  if (!target) return null;
  const { owner, repo, score } = target;
  const { data, error } = await supabase
    .from('reports')
    .upsert(
      {
        owner,
        repo,
        kind: result.id,
        score,
        summary: result.data,
        created_by: userId,
      },
      { onConflict: 'owner,repo,kind' },
    )
    .select()
    .single();
  if (error) {
    console.warn('Could not save report:', error.message);
    return null;
  }
  return data as StoredReport;
}

export async function loadReport(
  owner: string,
  repo: string,
  kind: CommandId,
): Promise<StoredReport | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('reports')
    .select('*, profiles:created_by (gh_login, avatar_url)')
    .eq('owner', owner)
    .eq('repo', repo)
    .eq('kind', kind)
    .maybeSingle();
  if (error) {
    console.warn('Could not load report:', error.message);
    return null;
  }
  return (data as StoredReport | null) ?? null;
}

export async function loadTargetReports(owner: string, repo: string): Promise<StoredReport[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('reports')
    .select('*, profiles:created_by (gh_login, avatar_url)')
    .eq('owner', owner)
    .eq('repo', repo)
    .order('updated_at', { ascending: false });
  if (error) {
    console.warn('Could not load reports:', error.message);
    return [];
  }
  return (data as StoredReport[]) ?? [];
}

export function toCommandResult(report: StoredReport): CommandResult {
  return { id: report.kind, data: report.summary } as CommandResult;
}