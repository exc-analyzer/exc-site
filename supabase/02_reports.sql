-- =============================================================================
-- EXC Analyzer topluluk platformu - Faz 2: raporlar
--
-- Supabase panelinde SQL Editor'e yapistirip calistir.
-- 01_profiles.sql'den SONRA calistirilmali.
--
-- Rapor, bir taramanin kalici ve paylasilabilir halidir. Iki isi birden yapar:
-- pahali taramayi tekrar etmemek icin onbellek, ve toplulugun uzerinde
-- konusacagi icerik.
--
-- HASSAS KOMUTLAR BURAYA HIC YAZILMAZ. scan-secrets, advanced-secrets ve
-- dork-scan sonuclari yalnizca tarayicida kalir. Asagidaki kind kisiti bunu
-- veritabani seviyesinde zorunlu kilar: uygulamada bir hata olsa bile o
-- sonuclar tabloya giremez.
-- =============================================================================

create table if not exists public.reports (
  id          uuid        primary key default gen_random_uuid(),
  owner       text        not null check (char_length(owner) between 1 and 100),
  -- Kullanici komutlarinda (user-analysis, user-anomaly) depo yoktur;
  -- owner kullanici adini tasir, repo bos kalir.
  repo        text        not null check (char_length(repo) <= 200),
  kind        text        not null,
  -- Puani olan komutlar icin (security-score, user-anomaly). Digerlerinde null.
  score       integer     check (score is null or score between 0 and 100),
  summary     jsonb       not null,
  scan_count  integer     not null default 1,
  created_by  uuid        references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Bir depo + komut ikilisi icin tek kayit. Yeni tarama ustune yazar.
  unique (owner, repo, kind),

  -- Hassas komutlarin sonuclari veritabanina giremez.
  constraint reports_kind_allowed check (
    kind in (
      'analysis',
      'security-score',
      'content-audit',
      'contrib-impact',
      'file-history',
      'actions-audit',
      'commit-anomaly',
      'user-analysis',
      'user-anomaly'
    )
  ),

  -- Tek bir kayit veritabanini sisirmesin. Ucretsiz katman 500 MB.
  constraint reports_summary_size check (pg_column_size(summary) <= 100000)
);

create index if not exists reports_owner_repo_idx on public.reports (owner, repo);
create index if not exists reports_updated_idx    on public.reports (updated_at desc);
create index if not exists reports_score_idx      on public.reports (score desc) where score is not null;

alter table public.reports enable row level security;

-- Raporlar herkese acik: giris yapmadan da okunabilmeli, cunku paylasilan
-- baglantiyi acan kisi giris yapmis olmayabilir.
drop policy if exists "raporlar herkese acik okunur" on public.reports;
create policy "raporlar herkese acik okunur"
  on public.reports for select
  using (true);

drop policy if exists "giris yapmis kullanici rapor yazar" on public.reports;
create policy "giris yapmis kullanici rapor yazar"
  on public.reports for insert
  with check ((select auth.uid()) = created_by);

-- Guncelleme herkese acik degil ama giris yapmis herkese acik: baskasinin
-- taradigi bir depoyu sen yeniden tarayinca rapor tazelenmeli.
--
-- Bunun bilincli bir sonucu var: giris yapmis biri, uygulamayi kullanmadan
-- dogrudan API'ye yazarak uydurma icerik gonderebilir. Icerigi veritabani
-- dogrulayamaz. Bu yuzden her rapor "son tarayan" ile iliskilendiriliyor ve
-- yazma hizi asagida sinirlaniyor. Kotuye kullanim gorulurse kaydi kimin
-- yazdigi bellidir.
drop policy if exists "giris yapmis kullanici rapor tazeler" on public.reports;
create policy "giris yapmis kullanici rapor tazeler"
  on public.reports for update
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) = created_by);

-- Silme politikasi yok: kimse rapor silemez. Kaldirma talebi elle islenir.

-- -----------------------------------------------------------------------------
-- Yazma hizi siniri: kullanici basina saatte 120 rapor.
--
-- Normal kullanimda kimse bu sayiya yaklasmaz; amac otomatik bir betigin
-- tabloyu doldurmasini engellemek.
-- -----------------------------------------------------------------------------
create or replace function public.reports_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  select count(*) into recent
  from public.reports
  where created_by = (select auth.uid())
    and updated_at > now() - interval '1 hour';

  if recent >= 120 then
    raise exception 'Saatlik rapor yazma sınırına ulaşıldı. Bir süre sonra tekrar dene.';
  end if;

  -- Tazeleme sayaci ve ilk olusturma zamani istemciye birakilmaz.
  if tg_op = 'UPDATE' then
    new.scan_count := old.scan_count + 1;
    new.created_at := old.created_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reports_rate_limit_ins on public.reports;
create trigger reports_rate_limit_ins
  before insert on public.reports
  for each row execute function public.reports_rate_limit();

drop trigger if exists reports_rate_limit_upd on public.reports;
create trigger reports_rate_limit_upd
  before update on public.reports
  for each row execute function public.reports_rate_limit();

-- -----------------------------------------------------------------------------
-- Izinler.
--
-- Proje "Automatically expose new tables" kapali kuruldu; hicbir tablo biz
-- acikca izin vermeden Data API uzerinden erisilebilir olmaz.
-- -----------------------------------------------------------------------------
grant select on public.reports to anon, authenticated;
grant insert, update on public.reports to authenticated;
