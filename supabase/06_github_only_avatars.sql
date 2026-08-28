-- =============================================================================
-- EXC Analyzer - profil görselleri yalnızca GitHub'dan
--
-- Supabase panelinde SQL Editor'e yapistirip calistir.
-- 05_avatars.sql'den SONRA calistirilmali; onun actigi seyleri geri aliyor.
--
-- NEDEN
-- Kullanicidan gorsel yuklemek, uygunsuz icerik sorumlulugunu bize getiriyordu
-- ve sifir butceyle otomatik denetim mumkun degildi (nsfwjs denendi,
-- calismadi; ayrica tarayicida calisan her kontrol dogrudan API'ye istek atan
-- biri tarafindan atlanir).
--
-- Gorseli GitHub'a birakmak bu sorunu cozmuyor, ORTADAN KALDIRIYOR:
--   - GitHub kendi icerik denetimini zaten yapiyor
--   - Hesaplar dogrulanmis, ihlalde hesabi onlar kapatiyor
--   - Bizim depolamamiz, denetlememiz, kaldirmamiz gereken bir sey kalmiyor
--
-- Gorunen AD ozellestirilebilir kalmaya devam ediyor: metin, gorselden farkli
-- olarak bakildigi anda degerlendirilebiliyor ve zaten kimligin yaninda
-- gh_login duruyor.
-- =============================================================================

-- 1. Yuklenmis gorsellerin kaydini temizle.
update public.profiles
   set avatar_source = 'github',
       custom_avatar_url = null
 where avatar_source <> 'github' or custom_avatar_url is not null;

-- 2. Depolanan dosyalari sil.
delete from storage.objects where bucket_id = 'avatars';

-- 3. Yukleme politikalarini kaldir.
drop policy if exists "kullanici kendi gorselini yukler" on storage.objects;
drop policy if exists "kullanici kendi gorselini degistirir" on storage.objects;
drop policy if exists "kullanici kendi gorselini siler" on storage.objects;
drop policy if exists "gorseller herkese acik okunur" on storage.objects;

-- 4. Kovayi kaldir.
delete from storage.buckets where id = 'avatars';

-- 5. Kolonlari kaldir. Artik tek bir gorsel kaynagi var, secim diye bir sey yok.
alter table public.profiles
  drop column if exists custom_avatar_url,
  drop column if exists avatar_source;

-- 6. Koruma tetikleyicisini sadelestir.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  -- Kimlik alanlari kilitli. gh_login serbest birakilsaydi biri kendine
  -- "torvalds" yazip baskasi gibi gorunebilirdi; reputation serbest
  -- birakilsaydi kendi itibarini yukseltebilirdi.
  new.id            := old.id;
  new.gh_login      := old.gh_login;
  new.gh_name       := old.gh_name;
  new.gh_avatar_url := old.gh_avatar_url;
  new.avatar_url    := old.avatar_url;
  new.reputation    := old.reputation;
  new.created_at    := old.created_at;

  -- Kendi adi secildiyse bir ad yazilmis olmali; yoksa GitHub'a doner.
  if new.name_source = 'custom' and coalesce(btrim(new.display_name), '') = '' then
    new.name_source := 'github';
  end if;

  return new;
end;
$$;

-- 7. Gorunum tanimindan gorsel secimini cikar.
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

-- 8. Gorsel bildirimi diye bir sey kalmadi.
--    abuse_reports duruyor: yorumlar ve profiller icin hala gerekli.
delete from public.abuse_reports where target_type = 'avatar';

alter table public.abuse_reports
  drop constraint if exists abuse_reports_target_type_check;

alter table public.abuse_reports
  add constraint abuse_reports_target_type_check
  check (target_type in ('comment', 'profile', 'report'));
