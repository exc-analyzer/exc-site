import { supabase } from "./supabase";
import { forgetGithubToken } from "./githubToken";
import { clearCache } from "./github";
import { rememberProfile } from './profile';

export const GITHUB_SCOPES = "read:user";

export async function signInWithGitHub(
  returnTo?: string,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const target =
    returnTo ?? `${window.location.pathname}${window.location.search}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      scopes: GITHUB_SCOPES,
      redirectTo: `${window.location.origin}${target}`,
    },
  });
  return error ? error.message : null;
}

export async function signOutEverywhere(): Promise<void> {
  rememberProfile(null);
  forgetGithubToken();
  clearCache();
  if (supabase) await supabase.auth.signOut();
  window.location.href = "/app/";
}
