/**
 * Veritabanı hatalarını kullanıcıya gösterilebilir hâle getirir.
 *
 * İki sebeple:
 *
 * 1. ANLAŞILIRLIK — "new row violates row-level security policy for table
 *    comments" hiçbir kullanıcıya bir şey anlatmaz.
 *
 * 2. SIZINTI — ham mesajlar kısıt adlarını, tablo yapısını ve tetikleyici
 *    mantığını ele veriyor. Bu tek başına bir zafiyet değil (kuralı bilmek
 *    onu aşmaya yaramıyor, Postgres sunucu tarafında uyguluyor) ama gereksiz.
 *    Bilmesi gerekmeyen bir şeyi söylememek ücretsiz.
 *
 * Tanınmayan hatalar genel bir mesaja dönüşüyor; ham hâli yalnızca geliştirici
 * konsoluna yazılıyor.
 */

interface SupabaseErrorLike {
  message?: string;
  code?: string;
  details?: string;
}

/** Kullanıcıya gösterilecek metni üretir. */
export function friendlyDbError(error: SupabaseErrorLike | null | undefined): string | null {
  if (!error) return null;

  const raw = error.message ?? '';

  // Veritabanindaki tetikleyicilerden gelen mesajlar zaten kullanici icin
  // Turkce yazildi; onlari oldugu gibi gecirmek dogru.
  if (/yorum yazılamaz|sınırına ulaşıldı|kaydedilemedi/i.test(raw)) {
    return raw;
  }

  switch (error.code) {
    case '23505':
      return 'Bunu zaten yapmışsın.';
    case '23503':
      return 'İşlem yapılamadı: bağlı kayıt bulunamadı.';
    case '23514':
      return 'Girdiğin değer kabul edilmedi. Uzunluğu ve biçimi kontrol et.';
    case '42501':
      return 'Bu işlem için yetkin yok. Giriş yapmayı dene.';
    case 'PGRST301':
      return 'Oturumun geçerli değil. Yeniden giriş yap.';
  }

  if (/row-level security/i.test(raw)) {
    return 'Bu işlem için yetkin yok. Giriş yapmayı dene.';
  }
  if (/duplicate key/i.test(raw)) {
    return 'Bunu zaten yapmışsın.';
  }
  if (/violates check constraint/i.test(raw)) {
    return 'Girdiğin değer kabul edilmedi. Uzunluğu ve biçimi kontrol et.';
  }

  // Tanınmayan hata: ayrıntı kullanıcıya gitmiyor.
  console.warn('Veritabanı hatası:', raw, error.code ?? '');
  return 'İşlem tamamlanamadı. Biraz sonra tekrar dene.';
}
