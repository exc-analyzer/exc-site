import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { rememberGithubToken } from "./githubToken";

const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

const STAY_KEY = "exc.stay-signed-in";

export function staySignedIn(): boolean {
  try {
    return localStorage.getItem(STAY_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setStaySignedIn(stay: boolean): void {
  try {
    localStorage.setItem(STAY_KEY, stay ? "1" : "0");
    const from = stay ? sessionStorage : localStorage;
    const to = stay ? localStorage : sessionStorage;
    const moves: string[] = [];
    for (const key of Object.keys(from)) {
      if (key === "exc.github_token") moves.push(key);
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) moves.push(key);
    }
    for (const key of moves) {
      const value = from.getItem(key);
      if (value !== null) to.setItem(key, value);
      from.removeItem(key);
    }
  } catch {
    /* storage unavailable */
  }
}

const sessionScopedStorage = {
  getItem(key: string): string | null {
    try {
      return staySignedIn()
        ? localStorage.getItem(key)
        : sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (staySignedIn()) localStorage.setItem(key, value);
      else sessionStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  },
};

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage:
          typeof window === "undefined" ? undefined : sessionScopedStorage,
      },
    })
  : null;

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.provider_token) rememberGithubToken(session.provider_token);
  });
}
