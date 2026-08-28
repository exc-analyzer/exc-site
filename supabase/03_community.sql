-- =============================================================================
-- EXC Analyzer topluluk platformu - Faz 3: yorumlar ve oylar
--
-- Supabase panelinde SQL Editor'e yapistirip calistir.
-- 02_reports.sql'den SONRA calistirilmali.
--
-- Topluluk bos bir forumda degil, raporlarin uzerinde kuruluyor. Her rapor
-- zaten bir konu basligi: "bu deponun guvenlik puani 60, neden?" Insanlarin
-- konusacak somut bir seyi oluyor.
-- =============================================================================

create table if not exists public.comments (
  id          uuid        primary key default gen_random_uuid(),
  report_id   uuid        not null references public.reports (id) on delete cascade,
  author_id   uuid        not null references public.profiles (id) on delete cascade,
  parent_id   uuid        references public.comments (id) on delete cascade,
  body        text        not null check (char_length(btrim(body)) between 1 and 4000),
  vote_score  integer     not null default 0,
  -- Silinen yorum satiri kalir: altindaki yanitlar oksuz kalmasin.
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists comments_report_idx  on public.comments (report_id, created_at);
create index if not exists comments_author_idx  on public.comments (author_id);
create index if not exists comments_parent_idx  on public.comments (parent_id);

alter table public.comments enable row level security;

drop policy if exists "yorumlar herkese acik okunur" on public.comments;
create policy "yorumlar herkese acik okunur"
  on public.comments for select
  using (true);

drop policy if exists "kullanici kendi adina yorum yazar" on public.comments;
create policy "kullanici kendi adina yorum yazar"
  on public.comments for insert
  with check ((select auth.uid()) = author_id);

drop policy if exists "kullanici kendi yorumunu duzenler" on public.comments;
create policy "kullanici kendi yorumunu duzenler"
  on public.comments for update
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

-- Gercek silme yok: deleted_at isaretlenir, boylece yanit zinciri bozulmaz.

-- -----------------------------------------------------------------------------
-- Yorum yazma kisitlari.
--
-- Iki kural var ve ikisi de spam icin:
--   1. Yeni hesap ilk 24 saat yorum yazamaz. Toplu acilan hesaplarin ilk
--      dakikada icerik doldurmasini engeller.
--   2. Saatte en fazla 20 yorum.
-- -----------------------------------------------------------------------------
create or replace function public.comments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_created timestamptz;
  recent integer;
begin
  if tg_op = 'INSERT' then
    select created_at into account_created
    from public.profiles
    where id = new.author_id;

    if account_created is null or account_created > now() - interval '24 hours' then
      raise exception 'Hesabın açılmasının üzerinden 24 saat geçmeden yorum yazılamaz.';
    end if;

    select count(*) into recent
    from public.comments
    where author_id = new.author_id
      and created_at > now() - interval '1 hour';

    if recent >= 20 then
      raise exception 'Saatlik yorum sınırına ulaşıldı.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- Yazar, rapor ve olusturma zamani degistirilemez; oy sayisi istemciye
    -- birakilmaz, asagidaki oy tetikleyicisi yonetir.
    new.author_id  := old.author_id;
    new.report_id  := old.report_id;
    new.parent_id  := old.parent_id;
    new.created_at := old.created_at;
    new.vote_score := old.vote_score;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists comments_guard_ins on public.comments;
create trigger comments_guard_ins
  before insert on public.comments
  for each row execute function public.comments_guard();

drop trigger if exists comments_guard_upd on public.comments;
create trigger comments_guard_upd
  before update on public.comments
  for each row execute function public.comments_guard();

-- =============================================================================
-- Oylar
-- =============================================================================

create table if not exists public.votes (
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  target_type text        not null check (target_type in ('report', 'comment')),
  target_id   uuid        not null,
  value       smallint    not null check (value in (-1, 1)),
  created_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create index if not exists votes_target_idx on public.votes (target_type, target_id);

alter table public.votes enable row level security;

-- Kimin ne oyladigi herkese acik degil; yalnizca kendi oyunu gorursun.
-- Toplam puan zaten hedef satirinda tutuluyor.
drop policy if exists "kullanici kendi oyunu gorur" on public.votes;
create policy "kullanici kendi oyunu gorur"
  on public.votes for select
  using ((select auth.uid()) = user_id);

drop policy if exists "kullanici kendi adina oy verir" on public.votes;
create policy "kullanici kendi adina oy verir"
  on public.votes for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "kullanici oyunu degistirir" on public.votes;
create policy "kullanici oyunu degistirir"
  on public.votes for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "kullanici oyunu geri alir" on public.votes;
create policy "kullanici oyunu geri alir"
  on public.votes for delete
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Toplam oy puani hedef satirinda tutuluyor.
--
-- Her okumada saymak yerine tetikleyiciyle guncelleniyor: rapor listeleri
-- puana gore siralanacak ve her satir icin ayri sayim ucretsiz katmanda
-- pahali olurdu.
-- -----------------------------------------------------------------------------
create or replace function public.apply_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type_val text;
  target_id_val   uuid;
  delta           integer;
begin
  if tg_op = 'INSERT' then
    target_type_val := new.target_type;
    target_id_val   := new.target_id;
    delta           := new.value;
  elsif tg_op = 'UPDATE' then
    target_type_val := new.target_type;
    target_id_val   := new.target_id;
    delta           := new.value - old.value;
  else
    target_type_val := old.target_type;
    target_id_val   := old.target_id;
    delta           := -old.value;
  end if;

  if target_type_val = 'comment' then
    update public.comments
       set vote_score = vote_score + delta
     where id = target_id_val;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists votes_apply on public.votes;
create trigger votes_apply
  after insert or update or delete on public.votes
  for each row execute function public.apply_vote();

-- =============================================================================
-- Izinler
-- =============================================================================
grant select on public.comments to anon, authenticated;
grant insert, update on public.comments to authenticated;

grant select, insert, update, delete on public.votes to authenticated;
