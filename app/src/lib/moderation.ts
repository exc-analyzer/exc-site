import { supabase } from "./supabase";
import { friendlyDbError } from "./dbError";
import type { AccentId } from "./profile";

export type FilingStatus = "open" | "reviewed" | "dismissed";

export interface Filing {
  id: string;
  created_at: string;
  target_type: "comment" | "post" | "message" | "report";
  target_id: string;
  reason: string;
  status: FilingStatus;
  reported_by: string;
  body: string | null;
  author_login: string | null;
  gone: boolean;
  subject_owner: string | null;
  disputed: boolean;
  recoverable: boolean;
}

export interface VerifiedMember {
  id: string;
  gh_login: string;
  shown_name: string;
  avatar_url: string | null;
  accent: AccentId;
}

export interface SuppressedOwner {
  gh_login: string;
  reason: string | null;
  created_at: string;
  added_by: string | null;
}

export async function amIModerator(): Promise<boolean> {
  if (!supabase) return false;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return false;
  const { data, error } = await supabase
    .from("moderators")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function loadFilings(): Promise<Filing[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("moderation_queue");
  if (error) return null;
  return (data as unknown as Filing[]) ?? [];
}

export async function takeDown(filing: string): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("moderate_take_down", { filing });
  return error ? friendlyDbError(error) : null;
}

export async function restoreAsModerator(
  kind: "comment" | "post" | "message" | "report",
  subject: string,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("moderate_restore", { kind, subject });
  return error ? friendlyDbError(error) : null;
}

export async function removeAsModerator(
  kind: "comment" | "post" | "report",
  subject: string,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("moderate_remove", { kind, subject });
  return error ? friendlyDbError(error) : null;
}

export async function settleFiling(
  filing: string,
  verdict: FilingStatus,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("moderate_settle", { filing, verdict });
  return error ? friendlyDbError(error) : null;
}

export async function suppressOwner(
  login: string,
  why: string | null,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("suppress_owner", { login, why });
  return error ? friendlyDbError(error) : null;
}

export async function unsuppressOwner(login: string): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("unsuppress_owner", { login });
  return error ? friendlyDbError(error) : null;
}

export async function loadSuppressed(): Promise<SuppressedOwner[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("suppression_list");
  if (error) return null;
  return (data as unknown as SuppressedOwner[]) ?? [];
}

export async function loadVerified(): Promise<VerifiedMember[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("verified_list");
  if (error) return null;
  return (data as unknown as VerifiedMember[]) ?? [];
}

export async function setVerified(
  login: string,
  yes: boolean,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("set_verified", { login, yes });
  return error ? friendlyDbError(error) : null;
}
