const STORAGE_KEY = "exc.github_token";
const STAY_KEY = "exc.stay-signed-in";

function keepsIt(): boolean {
  try {
    return localStorage.getItem(STAY_KEY) !== "0";
  } catch {
    return false;
  }
}

export function rememberGithubToken(token: string | null | undefined): void {
  if (!token) return;
  try {
    if (keepsIt()) {
      localStorage.setItem(STORAGE_KEY, token);
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, token);
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

export function getGithubToken(): string | null {
  try {
    return (
      localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

export function forgetGithubToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}
