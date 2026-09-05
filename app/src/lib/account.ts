import { supabase } from "./supabase";
import { friendlyDbError } from "./dbError";
import { rememberProfile } from "./profile";

export async function deleteMyAccount(): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return friendlyDbError(error);
  rememberProfile(null);
  await supabase.auth.signOut();
  return null;
}
