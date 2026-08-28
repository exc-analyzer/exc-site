import { useEffect, useState } from 'react';
import {
  ACCENTS,
  accentColor,
  loadMyProfile,
  saveMyProfile,
  shownAvatar,
  shownName,
  type AccentId,
  type Profile,
  type SourceChoice,
} from '../../lib/profile';

/**
 * Profil özelleştirme.
 *
 * Kullanıcı adını ve görselini GitHub'dan mı alacağını yoksa kendisi mi
 * yazacağını seçiyor. Seçim anında sağdaki önizlemeye yansıyor: ne olacağını
 * kaydetmeden önce görüyor.
 *
 * GitHub kullanıcı adı (@brgkdm) her koşulda görünmeye devam ediyor. Görünen
 * ad özgür olsun ama kimlik değil: aksi hâlde biri kendine "torvalds" yazıp
 * başkası gibi davranabilirdi.
 */
export default function ProfileEditor() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Karsilama modu profilden turetiliyor: daha once kurulum yapilmadiysa
  // dugme metni ve akis degisiyor.
  const mode: 'page' | 'onboarding' = profile?.onboarded_at ? 'page' : 'onboarding';

  useEffect(() => {
    void loadMyProfile().then((p) => {
      setProfile(p);
      setLoading(false);
    });
  }, []);

  function patch(next: Partial<Profile>) {
    setProfile((prev) => (prev ? { ...prev, ...next } : prev));
    setSaved(false);
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    setError(null);

    const { error } = await saveMyProfile({
      display_name: profile.display_name?.trim() || null,
      name_source: profile.name_source,
      bio: profile.bio?.trim() || null,
      accent: profile.accent,
      onboarded_at: profile.onboarded_at ?? new Date().toISOString(),
    });

    setSaving(false);
    if (error) {
      setError(error);
      return;
    }
    setSaved(true);
    if (mode === 'onboarding') window.location.href = '/app/';
  }

  if (loading) {
    return <p className="text-sm text-[var(--color-muted)]">Yükleniyor…</p>;
  }

  if (!profile) {
    return (
      <div className="surface p-8 text-center">
        <p className="text-sm text-[var(--color-muted)]">
          Profilini düzenlemek için{' '}
          <a href="/app/" className="link">
            GitHub ile giriş yap
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        {/* --- Görünen ad --- */}
        <section className="surface p-6">
          <h2 className="text-sm font-semibold">Görünen ad</h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Yorumlarda ve raporlarda bu ad görünür. GitHub kullanıcı adın
            <span className="font-mono"> @{profile.gh_login}</span> her zaman yanında durur.
          </p>

          <div className="mt-4 space-y-3">
            <ChoiceRow
              selected={profile.name_source === 'github'}
              onSelect={() => patch({ name_source: 'github' })}
              title="GitHub'daki adım"
              detail={profile.gh_name || profile.gh_login}
            />
            <ChoiceRow
              selected={profile.name_source === 'custom'}
              onSelect={() => patch({ name_source: 'custom' })}
              title="Kendi yazdığım ad"
              detail={profile.display_name?.trim() || 'Henüz yazılmadı'}
            />
          </div>

          {profile.name_source === 'custom' && (
            <div className="mt-4">
              <label className="label" htmlFor="display-name">
                Adın
              </label>
              <input
                id="display-name"
                className="field"
                value={profile.display_name ?? ''}
                maxLength={40}
                placeholder="Örn. Berat"
                onChange={(e) => patch({ display_name: e.target.value })}
              />
            </div>
          )}
        </section>

        {/* --- Profil görseli --- */}
        <section className="surface p-6">
          <h2 className="text-sm font-semibold">Profil görseli</h2>
          <div className="mt-4 flex items-center gap-4">
            <Avatar
              src={profile.gh_avatar_url}
              name={shownName(profile)}
              accent={accentColor(profile.accent)}
              size={56}
            />
            <div className="min-w-0 text-xs text-[var(--color-muted)]">
              <p className="text-sm text-[var(--color-text)]">GitHub görselin kullanılıyor</p>
              <p className="mt-1">
                Değiştirmek için{' '}
                <a
                  href="https://github.com/settings/profile"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  GitHub profilinden
                </a>{' '}
                güncelle, sonra buradan çıkıp tekrar giriş yap.
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-[var(--color-faint)]">
            Görsel yükleme bilerek yok. Doğrulamayı GitHub yapıyor: hesaplar doğrulanmış,
            içerik denetimi ve ihlalde hesap kapatma onların tarafında.
          </p>
        </section>

        {/* --- Hakkında --- */}
        <section className="surface p-6">
          <h2 className="text-sm font-semibold">Hakkında</h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">İsteğe bağlı, en fazla 280 karakter.</p>
          <textarea
            className="field mt-4 resize-y"
            rows={3}
            maxLength={280}
            value={profile.bio ?? ''}
            placeholder="Ne yapıyorsun, neyle ilgileniyorsun?"
            onChange={(e) => patch({ bio: e.target.value })}
          />
          <p className="mt-1.5 text-right text-xs text-[var(--color-faint)]">
            {(profile.bio ?? '').length}/280
          </p>
        </section>

        {/* --- Vurgu rengi --- */}
        <section className="surface p-6">
          <h2 className="text-sm font-semibold">Vurgu rengi</h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">Profilinde kullanılır.</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => patch({ accent: a.id as AccentId })}
                aria-label={a.label}
                aria-pressed={profile.accent === a.id}
                className={`size-9 rounded-full border-2 transition ${
                  profile.accent === a.id
                    ? 'border-[var(--color-text)] scale-110'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: a.color }}
              />
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-4">
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Kaydediliyor…' : mode === 'onboarding' ? 'Kaydet ve başla' : 'Kaydet'}
          </button>
          {saved && <span className="text-xs text-[var(--color-good)]">Kaydedildi</span>}
          {error && <span className="text-xs text-[var(--color-bad)]">{error}</span>}
          {mode === 'onboarding' && (
            <a href="/app/" className="btn btn-quiet">
              Şimdilik atla
            </a>
          )}
        </div>
      </div>

      {/* --- Önizleme --- */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="surface overflow-hidden">
          <div
            className="h-20"
            style={{
              background: `linear-gradient(135deg, ${accentColor(profile.accent)}55, transparent 70%)`,
            }}
          />
          <div className="-mt-10 px-6 pb-6">
            <Avatar
              src={shownAvatar(profile)}
              name={shownName(profile)}
              accent={accentColor(profile.accent)}
              size={72}
            />
            <p className="mt-3 text-base font-semibold">{shownName(profile)}</p>
            <p className="font-mono text-xs text-[var(--color-muted)]">@{profile.gh_login}</p>
            {profile.bio?.trim() && (
              <p className="mt-3 text-sm text-[var(--color-muted)]">{profile.bio}</p>
            )}
            <p className="mt-4 text-xs text-[var(--color-faint)]">Böyle görüneceksin.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ChoiceRow({
  selected,
  onSelect,
  title,
  detail,
  preview,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
  preview?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-[var(--radius-control)] border p-3 text-left transition ${
        selected
          ? 'border-[var(--color-line-active)] bg-[rgba(99,102,241,0.08)]'
          : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)]'
      }`}
    >
      <span
        className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${
          selected ? 'border-[var(--color-primary)]' : 'border-[var(--color-line-strong)]'
        }`}
      >
        {selected && <span className="size-2 rounded-full bg-[var(--color-primary)]" />}
      </span>

      {preview !== undefined && (
        <img
          src={preview || undefined}
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 rounded-full bg-[var(--color-raised)] object-cover"
        />
      )}

      <span className="min-w-0">
        <span className="block text-sm">{title}</span>
        <span className="block truncate text-xs text-[var(--color-muted)]">{detail}</span>
      </span>
    </button>
  );
}

export function Avatar({
  src,
  name,
  accent,
  size = 40,
}: {
  src: string | null;
  name: string;
  accent?: string;
  size?: number;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderColor: accent }}
        className="rounded-full border-2 bg-[var(--color-raised)] object-cover"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size, backgroundColor: accent ?? 'var(--color-primary)' }}
      className="grid place-items-center rounded-full font-semibold text-white"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
