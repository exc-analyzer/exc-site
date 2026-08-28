/**
 * Profil okuma ve güncelleme.
 *
 * KİMLİK ile GÖRÜNÜM ayrı tutuluyor. `gh_login` her zaman GitHub'dan gelen
 * doğrulanmış kullanıcı adı ve değiştirilemiyor; kullanıcının seçtiği ad
 * yalnızca bir görünen isim. Böylece biri kendine "torvalds" görünen adını
 * verse bile gerçek kimliği (@brgkdm) yanında duruyor ve taklit mümkün olmuyor.
 */
import { supabase } from './supabase';

export const ACCENTS = [
  { id: 'indigo', label: 'İndigo', color: '#6366f1' },
  { id: 'violet', label: 'Mor', color: '#8b5cf6' },
  { id: 'pink', label: 'Pembe', color: '#ec4899' },
  { id: 'emerald', label: 'Yeşil', color: '#34d399' },
  { id: 'amber', label: 'Amber', color: '#fbbf24' },
] as const;

export type AccentId = (typeof ACCENTS)[number]['id'];
export type SourceChoice = 'github' | 'custom';

export interface Profile {
  id: string;
  gh_login: string;
  gh_name: string | null;
  gh_avatar_url: string | null;
  display_name: string | null;
  custom_avatar_url: string | null;
  name_source: SourceChoice;
  avatar_source: SourceChoice;
  bio: string | null;
  accent: AccentId;
  reputation: number;
  created_at: string;
  onboarded_at: string | null;
}

/** Ekranda hangi ad ve görselin kullanılacağını belirler. */
export function shownName(p: Profile): string {
  if (p.name_source === 'custom' && p.display_name?.trim()) return p.display_name;
  return p.gh_name?.trim() || p.gh_login;
}

export function shownAvatar(p: Profile): string | null {
  if (p.avatar_source === 'custom' && p.custom_avatar_url?.trim()) return p.custom_avatar_url;
  return p.gh_avatar_url;
}

export function accentColor(id: AccentId): string {
  return ACCENTS.find((a) => a.id === id)?.color ?? '#6366f1';
}

export async function loadMyProfile(): Promise<Profile | null> {
  if (!supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !data) return null;
  const profile = data as Profile;

  // Bu alanlar 04 numarali gecisten once acilmis hesaplarda bos olabilir.
  // Oturumdaki dogrulanmis GitHub bilgisinden bir kez dolduruluyor.
  const meta = session.user.user_metadata ?? {};
  const patch: Record<string, string> = {};
  if (!profile.gh_avatar_url && typeof meta.avatar_url === 'string') {
    patch.gh_avatar_url = meta.avatar_url;
  }
  if (!profile.gh_name && typeof meta.full_name === 'string') {
    patch.gh_name = meta.full_name;
  }

  if (Object.keys(patch).length > 0) {
    // gh_* alanlari koruma tetikleyicisiyle kilitli oldugu icin dogrudan
    // guncellenemiyor; bu yuzden yalnizca yerel kopya tamamlaniyor.
    // Kalici doldurma kayit aninda yapiliyor (handle_new_user).
    Object.assign(profile, patch);
  }

  return profile;
}

export interface ProfilePatch {
  display_name?: string | null;
  custom_avatar_url?: string | null;
  name_source?: SourceChoice;
  avatar_source?: SourceChoice;
  bio?: string | null;
  accent?: AccentId;
  onboarded_at?: string;
}

export async function saveMyProfile(patch: ProfilePatch): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Bağlantı yok.' };

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return { error: 'Giriş yapılmamış.' };

  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  return { error: error?.message ?? null };
}
