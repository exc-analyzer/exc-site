/**
 * Sitenin kanonik adresi.
 *
 * Paylaşılan hiçbir bağlantı, bakılan adrese göre değişmemeli. README'ye
 * gömülen rozet ve kopyalanan kalıcı adres her zaman yayındaki siteyi
 * göstermeli — aksi hâlde yerelde çalışırken kopyalanan bağlantı
 * "http://localhost:4321/..." oluyor ve başkasında hiç açılmıyor.
 * (shields.io HTTP adresi kabul etmediği için rozet de kırılıyordu.)
 */
export const SITE_URL =
  (import.meta.env.PUBLIC_SITE_URL as string | undefined) ?? 'https://exc-analyzer.web.app';
