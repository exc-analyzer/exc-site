/**
 * Profil görseli yükleme.
 *
 * İçerik denetiminde iki tür kontrol var ve hangisinin gerçekten koruduğunu
 * ayırt etmek önemli:
 *
 *   ATLANABİLİR — burada, tarayıcıda çalışır. Doğrudan Storage API'sine
 *   istek atan biri bunları atlar. İyi niyetli çoğunluğu yakalar:
 *     · boyut küçültme ve yeniden kodlama
 *     · uygunsuz içerik taraması
 *
 *   ATLANAMAZ — Supabase tarafında tanımlı (05_avatars.sql):
 *     · 500 KB dosya sınırı
 *     · yalnızca webp/jpeg/png
 *     · kullanıcı başına TEK dosya, adı kendi kimliği
 *     · her görselin doğrulanmış bir GitHub hesabına bağlı olması
 *     · bildirme ve kaldırma
 *
 * Ücretsiz katmanda otomatik ve atlanamaz bir denetim mümkün değil; sunucuda
 * model çalıştırmak gerekirdi. Asıl kontrol caydırıcılık ve kaldırma.
 */
import { supabase } from './supabase';

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const OUTPUT_SIZE = 400;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export type UploadStage = 'reading' | 'checking' | 'encoding' | 'uploading';

export interface UploadResult {
  url: string | null;
  error: string | null;
  /** Uygunsuz içerik taraması çalıştırılabildi mi? */
  screened: boolean;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Dosya bir görsel olarak açılamadı.'));
    };
    img.src = url;
  });
}

/**
 * Görseli 400x400 kareye kırpıp WebP olarak yeniden kodlar.
 *
 * Bu yalnızca boyut küçültme değil, bir güvenlik adımı: dosyanın orijinal
 * baytları atılıyor, yerine tarayıcının çizdiği piksellerden yeni bir dosya
 * üretiliyor. Böylece görselin içine gömülmüş her şey (konum bilgisi taşıyan
 * EXIF verisi, görsel gibi görünüp aslında başka bir dosya olan içerikler)
 * ortadan kalkıyor.
 */
async function reencode(img: HTMLImageElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tarayıcı görseli işleyemedi.');

  // Kısa kenardan kare kırpma, ortadan.
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.85),
  );
  if (!blob) throw new Error('Görsel dönüştürülemedi.');
  return blob;
}

let nsfwModelPromise: Promise<unknown> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Betik yüklenemedi.'));
    document.head.appendChild(el);
  });
}

/**
 * Uygunsuz içerik taraması.
 *
 * Model 2.7 MB ve yalnızca dosya seçildiğinde, jsDelivr üzerinden yükleniyor;
 * bizim bant genişliğimizden gitmiyor ve sayfa açılışını hiç etkilemiyor.
 *
 * Yüklenemezse yükleme engellenmiyor: sunucu tarafındaki sınırlar ve bildirme
 * zaten yerinde. Model erişilemediği için kimseyi görselsiz bırakmak, sağladığı
 * korumadan daha çok zarar verirdi.
 */
async function screen(img: HTMLImageElement): Promise<{ ok: boolean; screened: boolean; label?: string }> {
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/nsfwjs@4.4.0/dist/browser/nsfwjs.min.js');

    const lib = (window as unknown as { nsfwjs?: { load: () => Promise<unknown> } }).nsfwjs;
    if (!lib) return { ok: true, screened: false };

    nsfwModelPromise ??= lib.load();
    const model = (await nsfwModelPromise) as {
      classify: (i: HTMLImageElement) => Promise<{ className: string; probability: number }[]>;
    };

    const predictions = await model.classify(img);
    const score = (name: string) =>
      predictions.find((p) => p.className === name)?.probability ?? 0;

    if (score('Porn') > 0.6) return { ok: false, screened: true, label: 'müstehcen' };
    if (score('Hentai') > 0.6) return { ok: false, screened: true, label: 'müstehcen' };
    if (score('Sexy') > 0.85) return { ok: false, screened: true, label: 'müstehcen' };

    return { ok: true, screened: true };
  } catch {
    return { ok: true, screened: false };
  }
}

export async function uploadAvatar(
  file: File,
  onStage?: (stage: UploadStage) => void,
): Promise<UploadResult> {
  if (!supabase) return { url: null, error: 'Bağlantı yok.', screened: false };

  if (!ACCEPTED.includes(file.type)) {
    return { url: null, error: 'Yalnızca PNG, JPEG, WebP veya GIF yükleyebilirsin.', screened: false };
  }
  if (file.size > MAX_INPUT_BYTES) {
    return { url: null, error: 'Dosya 8 MB’den küçük olmalı.', screened: false };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return { url: null, error: 'Giriş yapılmamış.', screened: false };

  try {
    onStage?.('reading');
    const img = await loadImage(file);

    if (img.naturalWidth < 64 || img.naturalHeight < 64) {
      return { url: null, error: 'Görsel en az 64×64 olmalı.', screened: false };
    }

    onStage?.('checking');
    const verdict = await screen(img);
    if (!verdict.ok) {
      return {
        url: null,
        error: 'Bu görsel uygunsuz içerik taramasından geçemedi. Başka bir görsel dene.',
        screened: true,
      };
    }

    onStage?.('encoding');
    const blob = await reencode(img);

    onStage?.('uploading');
    const path = `${userId}.webp`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { contentType: 'image/webp', upsert: true });

    if (uploadError) {
      return { url: null, error: uploadError.message, screened: verdict.screened };
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    // Onbellek kirici: ayni adrese yazildigi icin tarayici eskisini gosterirdi.
    const url = `${data.publicUrl}?v=${Date.now()}`;

    return { url, error: null, screened: verdict.screened };
  } catch (err) {
    return {
      url: null,
      error: err instanceof Error ? err.message : 'Görsel yüklenemedi.',
      screened: false,
    };
  }
}

export const STAGE_LABELS: Record<UploadStage, string> = {
  reading: 'Görsel okunuyor…',
  checking: 'İçerik kontrol ediliyor…',
  encoding: 'Boyutlandırılıyor…',
  uploading: 'Yükleniyor…',
};
