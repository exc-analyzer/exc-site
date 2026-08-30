-- =============================================================================
-- EXC Analyzer - profil görselleri yalnızca GitHub'dan
--
-- 05_avatars.sql'den SONRA çalıştırılmalı; onun açtığı şeyleri geri alıyor.
--
-- ÖNCE PANELDEN YAPILACAK İKİ ŞEY VAR
--
--   Supabase, depolama tablolarından SQL ile silmeyi engelliyor:
--     ERROR 42501: Direct deletion from storage tables is not allowed.
--   Sebebi haklı: SQL yalnızca kaydı siler, dosyanın baytları arka uçta
--   öksüz kalır. Silme işi Storage API'sinden geçmeli.
--
--   Bu yüzden bu dosyayı çalıştırmadan ÖNCE:
--     1. Storage -> avatars kovasını aç, içindeki dosyaları sil
--     2. Kovanın kendisini sil (üç nokta menüsü -> Delete bucket)
--
--   Sonra bu dosyayı çalıştır. Dosya yalnızca veritabanı tarafını temizler.
--
-- NEDEN
-- Kullanıcıdan görsel yüklemek, uygunsuz içerik sorumluluğunu bize
-- getiriyordu ve sıfır bütçeyle otomatik denetim mümkün değildi (nsfwjs
-- denendi, çalışmadı; ayrıca tarayıcıda çalışan her kontrol doğrudan API'ye
-- istek atan biri tarafından atlanır).
--
-- Görseli GitHub'a bırakmak bu sorunu çözmüyor, ORTADAN KALDIRIYOR:
--   - GitHub kendi içerik denetimini zaten yapıyor
--   - Hesaplar doğrulanmış, ihlalde hesabı onlar kapatıyor
--   - Bizim depolayacağımız, denetleyeceğimiz, kaldıracağımız bir şey kalmıyor
--
-- Görünen AD özelleştirilebilir kalmaya devam ediyor: metin, görselden farklı
-- olarak bakıldığı anda değerlendirilebiliyor ve kimliğin yanında gh_login
-- her zaman duruyor.
-- =============================================================================

-- 1. Yüklenmiş görsellerin profil kaydını temizle.
--    (Dosyaların kendisi panelden silinmiş olmalı.)
update public.profiles
   set avatar_source = 'github',
       custom_avatar_url = null
 where avatar_source is distinct from 'github'
    or custom_avatar_url is not null;

-- 2. Yükleme politikalarını kaldır. Bunlar politika tanımı, veri değil —
--    SQL ile kaldırılabiliyor.
drop policy if exists "kullanici kendi gorselini yukler" on storage.objects;
drop policy if exists "kullanici kendi gorselini degistirir" on storage.objects;
drop policy if exists "kullanici kendi gorselini siler" on storage.objects;
drop policy if exists "gorseller herkese acik okunur" on storage.objects;

-- 3. Görünümü ÖNCE yeniden tanımla.
--
--    profile_display, shown_avatar alanını custom_avatar_url üzerinden
--    hesaplıyordu. Kolon o görünüm dururken düşürülemez:
--      ERROR 2BP01: cannot drop column ... because other objects depend on it
--    Görünüm önce gh_avatar_url'e çevrilince bağımlılık ortadan kalkıyor ve
--    kolon sorunsuz düşüyor. Sıra önemli.
create or replace view public.profile_display as
  select
    id,
    gh_login,
    accent,
    reputation,
    bio,
    created_at,
    onboarded_at,
    case when name_source = 'custom' and display_name is not null
         then display_name
         else coalesce(gh_name, gh_login)
    end as shown_name,
    gh_avatar_url as shown_avatar
  from public.profiles;

grant select on public.profile_display to anon, authenticated;

-- 4. Artık bağımlılık yok, kolonları düşür. Artık tek bir görsel kaynağı var, seçim diye bir şey yok.
alter table public.profiles
  drop column if exists custom_avatar_url,
  drop column if exists avatar_source;

-- 5. Koruma tetikleyicisini sadeleştir.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  -- Kimlik alanları kilitli. gh_login serbest bırakılsaydı biri kendine
  -- "torvalds" yazıp başkası gibi görünebilirdi; reputation serbest
  -- bırakılsaydı kendi itibarını yükseltebilirdi.
  new.id            := old.id;
  new.gh_login      := old.gh_login;
  new.gh_name       := old.gh_name;
  new.gh_avatar_url := old.gh_avatar_url;
  new.avatar_url    := old.avatar_url;
  new.reputation    := old.reputation;
  new.created_at    := old.created_at;

  -- Kendi adı seçildiyse bir ad yazılmış olmalı; yoksa GitHub'a döner.
  if new.name_source = 'custom' and coalesce(btrim(new.display_name), '') = '' then
    new.name_source := 'github';
  end if;

  return new;
end;
$$;

-- 6. Görsel bildirimi diye bir şey kalmadı.
--    abuse_reports duruyor: yorumlar ve profiller için hâlâ gerekli.
delete from public.abuse_reports where target_type = 'avatar';

alter table public.abuse_reports
  drop constraint if exists abuse_reports_target_type_check;

alter table public.abuse_reports
  add constraint abuse_reports_target_type_check
  check (target_type in ('comment', 'profile', 'report'));

-- =============================================================================
-- DOĞRULAMA — bu sorgu çalıştıktan sonra üç satır da "temiz" demeli.
-- =============================================================================
select 'kolonlar kaldirildi' as kontrol,
       case when not exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'profiles'
            and column_name in ('custom_avatar_url', 'avatar_source')
       ) then 'temiz' else 'HALA VAR' end as sonuc
union all
select 'avatars kovasi',
       case when not exists (select 1 from storage.buckets where id = 'avatars')
            then 'temiz' else 'HALA VAR - panelden sil' end
union all
select 'yuklenmis dosya',
       case when not exists (select 1 from storage.objects where bucket_id = 'avatars')
            then 'temiz' else 'HALA VAR - panelden sil' end;
