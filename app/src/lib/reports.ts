/**
 * Rapor kaydı ve okuması.
 *
 * Bir rapor, taramanın kalıcı ve paylaşılabilir hâlidir. İki işi birden yapar:
 * pahalı taramayı tekrar etmemek için önbellek, ve topluluğun üzerinde
 * konuşacağı içerik.
 *
 * Hassas komutların sonuçları buraya HİÇ yazılmaz. Bu kural üç yerde birden
 * uygulanır: komut tanımındaki `sensitive` bayrağı, aşağıdaki kontrol ve
 * veritabanındaki `reports_kind_allowed` kısıtı. Üçü de bağımsız; birinde
 * hata olsa diğerleri tutar.
 */
import { supabase } from './supabase';
import { getCommand, type CommandId, type CommandResult } from '../engine';

export interface StoredReport {
  owner: string;
  repo: string;
  kind: CommandId;
  score: number | null;
  summary: unknown;
  scan_count: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  /** Son tarayanın profili; okurken birleştirilir. */
  profiles?: { gh_login: string; avatar_url: string | null } | null;
}

export interface ReportTarget {
  owner: string;
  repo: string;
  score: number | null;
}

/**
 * Sonucun hangi hedefe ait olduğunu ve varsa puanını çıkarır.
 *
 * dork-scan için null döner: o komut belirli bir depoya değil, GitHub
 * genelinde bir aramaya karşılık gelir ve zaten hiçbir zaman kaydedilmez.
 */
export function reportTarget(result: CommandResult): ReportTarget | null {
  switch (result.id) {
    case 'dork-scan':
      return null;
    case 'user-analysis':
      return { owner: result.data.login, repo: '', score: null };
    case 'user-anomaly':
      return { owner: result.data.login, repo: '', score: result.data.riskScore };
    case 'security-score':
      return { owner: result.data.owner, repo: result.data.repo, score: result.data.score };
    default:
      return { owner: result.data.owner, repo: result.data.repo, score: null };
  }
}

/** Raporun kalıcı adresi. Hassas komutlarda adres yoktur. */
export function reportPath(owner: string, repo: string, kind: CommandId): string | null {
  if (getCommand(kind).sensitive) return null;
  return repo ? `/app/r/${owner}/${repo}/${kind}` : `/app/u/${owner}/${kind}`;
}

export async function saveReport(result: CommandResult): Promise<StoredReport | null> {
  if (!supabase) return null;

  // Hassas komutlar hicbir kosulda kaydedilmez.
  if (getCommand(result.id).sensitive) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;

  const target = reportTarget(result);
  if (!target) return null;
  const { owner, repo, score } = target;

  const { data, error } = await supabase
    .from('reports')
    .upsert(
      {
        owner,
        repo,
        kind: result.id,
        score,
        summary: result.data,
        created_by: userId,
      },
      { onConflict: 'owner,repo,kind' },
    )
    .select()
    .single();

  if (error) {
    // Kaydedememek taramayi bosa cikarmaz; kullanici sonucu zaten goruyor.
    console.warn('Rapor kaydedilemedi:', error.message);
    return null;
  }

  return data as StoredReport;
}

export async function loadReport(
  owner: string,
  repo: string,
  kind: CommandId,
): Promise<StoredReport | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('reports')
    .select('*, profiles:created_by (gh_login, avatar_url)')
    .eq('owner', owner)
    .eq('repo', repo)
    .eq('kind', kind)
    .maybeSingle();

  if (error) {
    console.warn('Rapor okunamadı:', error.message);
    return null;
  }
  return (data as StoredReport | null) ?? null;
}

/** Bir hedef için kayıtlı bütün raporlar (hangi komutlar çalıştırılmış). */
export async function loadTargetReports(owner: string, repo: string): Promise<StoredReport[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('reports')
    .select('*, profiles:created_by (gh_login, avatar_url)')
    .eq('owner', owner)
    .eq('repo', repo)
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('Raporlar okunamadı:', error.message);
    return [];
  }
  return (data as StoredReport[]) ?? [];
}

/** Sonucu tekrar CommandResult biçimine getirir (görünüm bileşenleri onu bekler). */
export function toCommandResult(report: StoredReport): CommandResult {
  return { id: report.kind, data: report.summary } as CommandResult;
}
