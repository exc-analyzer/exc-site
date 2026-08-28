import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isConfigured } from '../lib/supabase';
import { rememberGithubToken, getGithubToken, forgetGithubToken } from '../lib/githubToken';

/**
 * Web tarafinda istenen tek izinler. CLI'nin kullandigi `repo` ve `workflow`
 * kapsamlari bilerek istenmiyor: kimse bir web sitesine tum ozel depolarina
 * tam erisim vermek istemez. Ozel depo analizi CLI'da kalir.
 */
const SCOPES = 'read:user public_repo';

export default function AuthPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setHasToken(Boolean(getGithubToken()));
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);

      // Supabase provider_token'i saklamaz; giris anindaki tek sansimiz bu.
      if (next?.provider_token) rememberGithubToken(next.provider_token);
      if (event === 'SIGNED_OUT') forgetGithubToken();

      setHasToken(Boolean(getGithubToken()));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { scopes: SCOPES, redirectTo: `${window.location.origin}/app/` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    forgetGithubToken();
    await supabase.auth.signOut();
    setBusy(false);
  }

  if (!isConfigured) {
    return (
      <Card>
        <h2 className="text-base font-semibold">Kurulum tamamlanmadı</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Supabase bağlantısı için <code className="text-[var(--color-text)]">PUBLIC_SUPABASE_URL</code> ve{' '}
          <code className="text-[var(--color-text)]">PUBLIC_SUPABASE_ANON_KEY</code> değerleri gerekiyor.
          <code className="text-[var(--color-text)]"> app/.env.example</code> dosyasını{' '}
          <code className="text-[var(--color-text)]">app/.env</code> olarak kopyalayıp doldur.
        </p>
      </Card>
    );
  }

  if (!ready) {
    return (
      <Card>
        <p className="text-sm text-[var(--color-muted)]">Yükleniyor…</p>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card>
        <h2 className="text-base font-semibold">GitHub ile giriş yap</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Yalnızca herkese açık depo bilgisi ve profilin istenir. Özel depolarına erişim istenmez.
        </p>
        <button
          onClick={signIn}
          disabled={busy}
          className="mt-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--color-border-hover)] disabled:opacity-50"
        >
          {busy ? 'Yönlendiriliyor…' : 'GitHub ile devam et'}
        </button>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Card>
    );
  }

  const meta = session.user.user_metadata ?? {};
  const login = meta.user_name ?? meta.preferred_username ?? session.user.email ?? 'kullanıcı';

  return (
    <Card>
      <div className="flex items-center gap-4">
        {meta.avatar_url && (
          <img src={meta.avatar_url} alt="" width={48} height={48} className="rounded-full" />
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{login}</p>
          <p className="text-sm text-[var(--color-muted)]">Giriş yapıldı</p>
        </div>
      </div>

      <p className="mt-5 text-sm text-[var(--color-muted)]">
        {hasToken
          ? 'GitHub bağlantısı hazır — taramalar senin kendi API kotanla çalışacak.'
          : 'GitHub bağlantısı bu sekmede yok. Tarama yapmak için tekrar giriş yap.'}
      </p>

      <div className="mt-5 flex gap-3">
        {!hasToken && (
          <button
            onClick={signIn}
            disabled={busy}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--color-border-hover)] disabled:opacity-50"
          >
            GitHub'ı yeniden bağla
          </button>
        )}
        <button
          onClick={signOut}
          disabled={busy}
          className="rounded-lg border border-transparent px-4 py-2 text-sm text-[var(--color-muted)] transition hover:text-[var(--color-text)] disabled:opacity-50"
        >
          Çıkış yap
        </button>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      {children}
    </section>
  );
}
