-- =============================================================================
-- EXC Analyzer topluluk platformu - profil görseli yükleme
--
-- Supabase panelinde SQL Editor'e yapistirip calistir.
-- 04_profile_customization.sql'den SONRA calistirilmali.
--
-- Kullanici bilgisayarindan gorsel yukleyebiliyor. Icerik denetiminde iki tur
-- kontrol var ve hangisinin gercekten koruma sagladigini ayirt etmek onemli:
--
--   ATLANABILIR (tarayicida calisir, iyi niyetli cogunlugu yakalar)
--     - boyut kucultme ve yeniden kodlama
--     - uygunsuz icerik taramasi
--   Bunlar dogrudan Storage API'sine istek atan biri tarafindan atlanabilir.
--
--   ATLANAMAZ (sunucu tarafinda, bu dosyada tanimli)
--     - dosya boyutu siniri
--     - izin verilen dosya turleri
--     - kullanici basina TEK dosya, adi kendi kimligi
--     - her gorselin dogrulanmis bir GitHub hesabina bagli olmasi
--     - bildirme ve kaldirma
--
-- Ucretsiz katmanda otomatik ve atlanamaz bir icerik denetimi mumkun degil;
-- sunucu tarafinda model calistirmak gerekirdi. Bu yuzden asil kontrol
-- caydiricilik ve kaldirma: her gorsel bir kimlige bagli ve bildirilebilir.
-- =============================================================================

-- Depolama kovasi. public: gorseller herkese acik okunur, cunku yorumlarda
-- ve raporlarda giris yapmamis ziyaretcilere de gorunmeleri gerekiyor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  512000, -- 500 KB. Yeniden kodlanmis 400x400 bir gorsel bunun cok altinda kalir.
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Kullanici yalnizca kendi kimligiyle adlandirilmis TEK dosyaya yazabilir.
--
-- Bu, depolamayi doldurma saldirisini bastan engelliyor: yeni yukleme eskisinin
-- ustune yaziyor, kimse ikinci bir dosya birakamiyor.
-- -----------------------------------------------------------------------------
drop policy if exists "gorseller herkese acik okunur" on storage.objects;
create policy "gorseller herkese acik okunur"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "kullanici kendi gorselini yukler" on storage.objects;
create policy "kullanici kendi gorselini yukler"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '.webp'
  );

drop policy if exists "kullanici kendi gorselini degistirir" on storage.objects;
create policy "kullanici kendi gorselini degistirir"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '.webp'
  );

drop policy if exists "kullanici kendi gorselini siler" on storage.objects;
create policy "kullanici kendi gorselini siler"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '.webp'
  );

-- =============================================================================
-- Bildirme
--
-- Otomatik denetim atlanabildigi icin asil kontrol bu: gorulen bir sikayet
-- kaydediliyor, kimin hakkinda oldugu ve kimin bildirdigi belli oluyor.
-- =============================================================================

create table if not exists public.abuse_reports (
  id           uuid        primary key default gen_random_uuid(),
  target_type  text        not null check (target_type in ('avatar', 'comment', 'profile', 'report')),
  target_id    uuid        not null,
  reporter_id  uuid        not null references public.profiles (id) on delete cascade,
  reason       text        not null check (char_length(btrim(reason)) between 3 and 500),
  status       text        not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at   timestamptz not null default now(),

  -- Ayni kisi ayni hedefi bir kez bildirebilir.
  unique (target_type, target_id, reporter_id)
);

create index if not exists abuse_open_idx on public.abuse_reports (status, created_at desc);

alter table public.abuse_reports enable row level security;

-- Bildirimler herkese acik degil: kimin kimi bildirdigi gorunurse
-- misilleme olur. Yalnizca bildiren kendi kaydini gorur.
drop policy if exists "bildiren kendi kaydini gorur" on public.abuse_reports;
create policy "bildiren kendi kaydini gorur"
  on public.abuse_reports for select
  using ((select auth.uid()) = reporter_id);

drop policy if exists "kullanici bildirim olusturur" on public.abuse_reports;
create policy "kullanici bildirim olusturur"
  on public.abuse_reports for insert
  with check ((select auth.uid()) = reporter_id);

grant select, insert on public.abuse_reports to authenticated;

-- -----------------------------------------------------------------------------
-- Gorsel kaldirma.
--
-- Bir gorsel uygunsuz bulunursa profildeki secim GitHub'a dondurulur ve ozel
-- adres temizlenir. Dosyanin kendisi Storage panelinden silinir.
--
-- Bu fonksiyon yalnizca proje sahibi tarafindan SQL Editor'den calistirilmak
-- uzere: kullanicilara yetki verilmiyor.
-- -----------------------------------------------------------------------------
create or replace function public.reset_avatar(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
     set avatar_source = 'github',
         custom_avatar_url = null
   where id = target;
$$;

revoke all on function public.reset_avatar(uuid) from public, anon, authenticated;
