import { supabase } from "./supabase";
import { getCommand, type CommandId, type CommandResult } from "../engine";
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
  created_by?: string | null;
  author_visibility?: 'default' | 'public' | 'private';
  disputed_at?: string | null;
  disputed_note?: string | null;
  scanner_login?: string | null;
  scanner_avatar?: string | null;
}
export interface ReportTarget {
  owner: string;
  repo: string;
  score: number | null;
}
export function reportTarget(result: CommandResult): ReportTarget | null {
  switch (result.id) {
    case "user-analysis":
      return null;
    case "security-score":
      return {
        owner: result.data.owner,
        repo: result.data.repo,
        score: result.data.score,
      };
    default:
      return { owner: result.data.owner, repo: result.data.repo, score: null };
  }
}
export function reportPath(
  owner: string,
  repo: string,
  kind: CommandId,
): string | null {
  if (getCommand(kind).sensitive) return null;
  return repo ? `/app/r/${owner}/${repo}/${kind}/` : `/app/u/${owner}/${kind}/`;
}
export async function canPublish(
  token: string | null,
  owner: string,
  repo: string,
): Promise<boolean> {
  if (!token || !repo) return false;
  try {
    const answer = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!answer.ok) return false;
    const body = (await answer.json()) as {
      permissions?: { push?: boolean; admin?: boolean };
    };
    return body.permissions?.push === true || body.permissions?.admin === true;
  } catch {
    return false;
  }
}

const PERSON_KEYS = new Set([
  "topCommitters",
  "topContributors",
  "contributors",
  "committers",
  "authors",
  "maintainers",
  "reviewers",
  "people",
]);

const PERSON_FIELDS = new Set(["email", "authorEmail", "committerEmail"]);

function withoutPeople(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPeople);
  if (value === null || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (PERSON_KEYS.has(key) || PERSON_FIELDS.has(key)) continue;
    out[key] = withoutPeople(inner);
  }
  return out;
}

export type SaveOutcome =
  | { kind: "saved"; report: StoredReport }
  | { kind: "skipped" }
  | { kind: "no-access" }
  | { kind: "failed" };

export async function saveReport(
  result: CommandResult,
  token: string | null,
): Promise<SaveOutcome> {
  if (!supabase) return { kind: "skipped" };
  if (getCommand(result.id).sensitive) return { kind: "skipped" };
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return { kind: "skipped" };

  const target = reportTarget(result);
  if (!target) return { kind: "skipped" };
  const { owner, repo, score } = target;

  if (!(await canPublish(token, owner, repo))) return { kind: "no-access" };
  const { data, error } = await supabase
    .from("reports")
    .upsert(
      {
        owner,
        repo,
        kind: result.id,
        score,
        summary: withoutPeople(result.data),
        created_by: userId,
      },
      { onConflict: "owner,repo,kind" },
    )
    .select(
      "id,owner,repo,kind,score,summary,scan_count,created_at,updated_at,author_visibility,disputed_at,disputed_note",
    )
    .single();
  if (error) {
    console.warn("Could not save report:", error.message);
    return { kind: "failed" };
  }
  return { kind: "saved", report: data as StoredReport };
}

export async function loadReport(
  owner: string,
  repo: string,
  kind: CommandId,
): Promise<StoredReport | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("report_card")
    .select("*")
    .eq("owner", owner)
    .eq("repo", repo)
    .eq("kind", kind)
    .maybeSingle();
  if (error) {
    console.warn("Could not load report:", error.message);
    return null;
  }
  return (data as StoredReport | null) ?? null;
}

export async function loadTargetReports(
  owner: string,
  repo: string,
): Promise<StoredReport[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("report_card")
    .select("*")
    .eq("owner", owner)
    .eq("repo", repo)
    .order("updated_at", { ascending: false });
  if (error) {
    console.warn("Could not load reports:", error.message);
    return [];
  }
  return (data as StoredReport[]) ?? [];
}

export async function setReportVisibility(
  reportId: string,
  visibility: "default" | "public" | "private",
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase
    .from("reports")
    .update({ author_visibility: visibility })
    .eq("id", reportId);
  return error ? error.message : null;
}

export async function markDisputed(
  reportId: string,
  note: string | null,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("mark_disputed", {
    report_id: reportId,
    note,
  });
  return error ? error.message : null;
}

export async function clearDispute(reportId: string): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("clear_dispute", { report_id: reportId });
  return error ? error.message : null;
}

export function toCommandResult(report: StoredReport): CommandResult {
  return { id: report.kind, data: report.summary } as CommandResult;
}
