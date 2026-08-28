# Moderasyon

Bu dosya, uygunsuz içerikle nasıl başa çıkıldığını anlatır.

## Profil görselleri: doğrulama GitHub'da

Kullanıcı görsel **yükleyemiyor**. Profil görseli her zaman GitHub hesabından
gelir.

Bu, çözemediğimiz bir sorunu ortadan kaldıran bir karar. Önce yükleme
yapılmıştı ve tarayıcıda çalışan bir içerik taraması (nsfwjs) denendi —
**çalışmadı**: paket modelini CDN'den çekilebilir biçimde yayınlamıyor
(JSON değil, JavaScript modülü) ve halka açık barındırılan bir model yok.
Kod sessizce başarısız oluyor, her görseli kabul ediyordu.

Ayrıca tarayıcıda çalışan bir kontrol, doğrudan Storage API'sine istek atan
biri tarafından zaten atlanır. Sıfır bütçeyle otomatik **ve** atlanamaz bir
denetim mümkün değil.

Görseli GitHub'a bırakmak bunu çözmüyor, gereksiz kılıyor:

- GitHub kendi içerik denetimini zaten yapıyor
- Hesaplar doğrulanmış; ihlalde hesabı onlar kapatıyor
- Bizim depolayacağımız, denetleyeceğimiz, kaldıracağımız bir şey kalmıyor

Görünen **ad** özelleştirilebilir kalmaya devam ediyor: metin, görselden farklı
olarak bakıldığı anda değerlendirilebiliyor ve kimliğin yanında `@gh_login`
her zaman duruyor.

## Yorumlar için ne var

| Kontrol | Nerede |
|---|---|
| Yeni hesap ilk 24 saat yorum yazamaz | tetikleyici |
| Saatte en fazla 20 yorum | tetikleyici |
| Her yorum doğrulanmış bir GitHub hesabına bağlı | Auth |
| Bildirme | `abuse_reports` |

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

```

Tekrar eden ihlallerde GitHub hesabı bilindiği için GitHub'a da bildirilebilir.
