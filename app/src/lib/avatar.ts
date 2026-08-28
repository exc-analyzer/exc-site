/**
 * Profil görseli yükleme.
 *
 * OTOMATİK İÇERİK TARAMASI YOK — ve bu bilinçli bir karar.
 *
 * Tarayıcıda çalışan bir model (nsfwjs) denendi ve çalışmadı: paket modelini
 * CDN'den çekilebilir biçimde yayınlamıyor (JSON değil, JavaScript modülü),
 * halka açık barındırılan bir model de yok. Kendi modelimizi barındırmak
 * 3,5 MB'lık bir dosyayı günlük 360 MB'lık kotaya sokmak demekti.
 *
 * Daha önemlisi: tarayıcıda çalışan bir kontrol doğrudan Storage API'sine
 * istek atan biri tarafından zaten atlanır. Sessizce açık kalan bir kontrol,
 * hiç olmayandan daha kötüdür — koruma olduğu sanılır.
 *
 * Bunun yerine ATLANAMAYAN kontrollere dayanıyoruz:
 *   · 400x400 kareye kırpma ve WebP olarak yeniden kodlama (aşağıda)
 *   · 500 KB dosya sınırı, yalnızca webp/jpeg/png (Supabase)
 *   · kullanıcı başına TEK dosya, adı kendi kimliği (Supabase)
 *   · her görselin doğrulanmış bir GitHub hesabına bağlı olması
 *   · bildirme ve tek komutla kaldırma
 *
 * Yani koruma caydırıcılık ve hızlı kaldırma üzerine kurulu. Gerçek otomatik
 * denetim isteniyorsa ücretli bir moderasyon servisi ya da sunucuda çalışan
 * bir model gerekir; ikisi de sıfır bütçeyle mümkün değil.
 */
import { supabase } from './supabase';

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const OUTPUT_SIZE = 400;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export type UploadStage = 'reading' | 'encoding' | 'uploading';

export interface UploadResult {
  url: string | null;
  error: string | null;
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

export async function uploadAvatar(
  file: File,
  onStage?: (stage: UploadStage) => void,
): Promise<UploadResult> {
  if (!supabase) return { url: null, error: 'Bağlantı yok.' };

  if (!ACCEPTED.includes(file.type)) {
    return { url: null, error: 'Yalnızca PNG, JPEG, WebP veya GIF yükleyebilirsin.' };
  }
  if (file.size > MAX_INPUT_BYTES) {
    return { url: null, error: 'Dosya 8 MB’den küçük olmalı.' };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return { url: null, error: 'Giriş yapılmamış.' };

  try {
    onStage?.('reading');
    const img = await loadImage(file);

    if (img.naturalWidth < 64 || img.naturalHeight < 64) {
      return { url: null, error: 'Görsel en az 64×64 olmalı.' };
    }

    onStage?.('encoding');
    const blob = await reencode(img);

    onStage?.('uploading');
    const path = `${userId}.webp`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { contentType: 'image/webp', upsert: true });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    // Onbellek kirici: ayni adrese yazildigi icin tarayici eskisini gosterirdi.
    const url = `${data.publicUrl}?v=${Date.now()}`;

    return { url, error: null };
  } catch (err) {
    return {
      url: null,
      error: err instanceof Error ? err.message : 'Görsel yüklenemedi.',
    };
  }
}

export const STAGE_LABELS: Record<UploadStage, string> = {
  reading: 'Görsel okunuyor…',
  encoding: 'Boyutlandırılıyor…',
  uploading: 'Yükleniyor…',
};
