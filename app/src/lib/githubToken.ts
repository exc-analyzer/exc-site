/**
 * Kullanicinin GitHub erisim token'i (Supabase'in `provider_token` degeri).
 *
 * Neden sessionStorage?
 *  - Supabase bu token'i saklamaz ve oturum yenilendiginde kaybeder, dolayisiyla
 *    giris aninda yakalayip kendimiz tutmamiz gerekiyor.
 *  - localStorage yerine sessionStorage: sekme kapaninca silinir, baska
 *    sekmelere sizmaz, kalici olarak diskte durmaz.
 *  - Token asla sunucuya, Supabase'e, log'a veya hata raporuna gonderilmez.
 *    Yalnizca kullanicinin kendi tarayicisindan api.github.com'a gider; boylece
 *    her kullanici kendi saatlik 5000 istek kotasini kullanir.
 */
const STORAGE_KEY = 'exc.github_token';

export function rememberGithubToken(token: string | null | undefined): void {
  if (!token) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* gizli sekme veya depolama kapali - token yalnizca bellekte kalir */
  }
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
  } catch {
    /* yoksay */
  }
}
