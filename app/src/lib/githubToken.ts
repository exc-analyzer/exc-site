const STORAGE_KEY = 'exc.github_token';
export function rememberGithubToken(token: string | null | undefined): void {
  if (!token) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {}
}
export function getGithubToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
export function forgetGithubToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}