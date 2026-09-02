import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { rememberGithubToken } from './githubToken';

const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.provider_token) rememberGithubToken(session.provider_token);
  });
}
