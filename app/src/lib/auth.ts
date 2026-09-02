import { supabase } from './supabase';
import { forgetGithubToken } from './githubToken';

export const GITHUB_SCOPES = 'read:user public_repo';

export async function signInWithGitHub(returnTo?: string): Promise<string | null> {
  if (!supabase) return 'No connection.';
  const target = returnTo ?? `${window.location.pathname}${window.location.search}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      scopes: GITHUB_SCOPES,
      redirectTo: `${window.location.origin}${target}`,
    },
  });
  return error ? error.message : null;
}

export async function signOutEverywhere(): Promise<void> {
  forgetGithubToken();
  if (supabase) await supabase.auth.signOut();
  window.location.href = '/app/';
}
