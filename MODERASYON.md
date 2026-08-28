# Moderasyon

Bu dosya, uygunsuz içerikle nasıl başa çıkıldığını anlatır.

## Otomatik denetim neden yok

Tarayıcıda çalışan bir model (nsfwjs) denendi, **çalışmadı**: paket modelini
CDN'den çekilebilir biçimde yayınlamıyor (JSON değil, JavaScript modülü) ve
halka açık barındırılan bir model de yok. Kendi modelimizi barındırmak
3,5 MB'lık bir dosyayı günlük 360 MB'lık Firebase kotasına sokmak demekti.

Daha önemlisi: tarayıcıda çalışan bir kontrol, doğrudan Storage API'sine istek
atan biri tarafından zaten atlanır. **Sessizce açık kalan bir kontrol, hiç
olmayandan daha kötüdür** — koruma olduğu sanılır.

Gerçek otomatik denetim isteniyorsa ücretli bir moderasyon servisi ya da
sunucuda çalışan bir model gerekir. İkisi de sıfır bütçeyle mümkün değil.

## Bunun yerine ne var

Atlanamayan kontroller:

| Kontrol | Nerede |
|---|---|
| 400×400 kırpma, WebP yeniden kodlama (EXIF ve gömülü içerik siliniyor) | tarayıcı |
| 500 KB dosya sınırı, yalnızca webp/jpeg/png | Supabase bucket |
| Kullanıcı başına **tek** dosya, adı kendi kimliği | Storage politikası |
| Her görsel doğrulanmış bir GitHub hesabına bağlı | Auth |
| Dışarıdan görsel adresi verilemez | arayüz + şema |
| Bildirme | `abuse_reports` |

Son madde asıl korumadır: içerik kimliğe bağlı ve bildirilebilir.

## Bildirimleri görmek

Supabase SQL Editor:

```sql
select a.created_at,
       a.target_type,
       a.target_id,
       a.reason,
       r.gh_login as bildiren
  from public.abuse_reports a
  join public.profiles r on r.id = a.reporter_id
 where a.status = 'open'
 order by a.created_at desc;
```

## Bir görseli kaldırmak

```sql
-- 1. Profildeki seçimi GitHub görseline döndür
select public.reset_avatar('KULLANICI_UUID');

-- 2. Dosyayı sil
delete from storage.objects
 where bucket_id = 'avatars'
   and name = 'KULLANICI_UUID.webp';

-- 3. Bildirimi kapat
update public.abuse_reports
   set status = 'reviewed'
 where target_id = 'KULLANICI_UUID' and target_type = 'avatar';
```

## Bir yorumu kaldırmak

```sql
update public.comments
   set deleted_at = now(), body = '[kaldırıldı]'
 where id = 'YORUM_UUID';
```

## Bir kullanıcıyı susturmak

Kalıcı bir engelleme mekanizması henüz yok. Şimdilik:

```sql
-- Yorumlarını kaldır
update public.comments
   set deleted_at = now(), body = '[kaldırıldı]'
 where author_id = 'KULLANICI_UUID';

-- Görselini sıfırla
select public.reset_avatar('KULLANICI_UUID');
```

Tekrar eden ihlallerde GitHub hesabı bilindiği için GitHub'a da bildirilebilir.
