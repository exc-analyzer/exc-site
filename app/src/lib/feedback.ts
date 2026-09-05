import { supabase } from "./supabase";
import { friendlyDbError } from "./dbError";

export type FeedbackKind = "idea" | "problem" | "other";
export type FeedbackStatus = "open" | "done";

export interface FeedbackEntry {
  id: string;
  created_at: string;
  kind: FeedbackKind;
  body: string;
  status: FeedbackStatus;
  author_login: string | null;
}

export async function sendFeedback(
  kind: FeedbackKind,
  body: string,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return "Sign in to send this.";

  const { error } = await supabase
    .from("feedback")
    .insert({ author_id: userId, kind, body: body.trim() });
  return error ? friendlyDbError(error) : null;
}

export async function loadFeedback(): Promise<FeedbackEntry[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("feedback_queue");
  if (error) return null;
  return (data as unknown as FeedbackEntry[]) ?? [];
}

export async function settleFeedback(
  entry: string,
  verdict: FeedbackStatus,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("settle_feedback", { entry, verdict });
  return error ? friendlyDbError(error) : null;
}
