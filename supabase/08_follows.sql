create table if not exists public.follows (
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  owner        text        not null check (char_length(owner) between 1 and 100),
  repo         text        not null check (char_length(repo) <= 200),
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),

  primary key (user_id, owner, repo)
);

create index if not exists follows_target_idx on public.follows (owner, repo);

alter table public.follows enable row level security;

drop policy if exists "user sees own follows" on public.follows;
create policy "user sees own follows"
  on public.follows for select
  using ((select auth.uid()) = user_id);

drop policy if exists "user follows as themselves" on public.follows;
create policy "user follows as themselves"
  on public.follows for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "user updates own follow" on public.follows;
create policy "user updates own follow"
  on public.follows for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "user unfollows" on public.follows;
create policy "user unfollows"
  on public.follows for delete
  using ((select auth.uid()) = user_id);

create or replace function public.follows_guard()
returns trigger
language plpgsql
as $$
declare
  held integer;
begin
  new.user_id := coalesce(old.user_id, new.user_id);

  if tg_op = 'INSERT' then
    select count(*) into held from public.follows where user_id = new.user_id;
    if held >= 500 then
      raise exception 'You can follow at most 500 targets.';
    end if;
    new.created_at := now();
  else
    new.owner      := old.owner;
    new.repo       := old.repo;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

drop trigger if exists follows_guard_ins on public.follows;
create trigger follows_guard_ins
  before insert on public.follows
  for each row execute function public.follows_guard();

drop trigger if exists follows_guard_upd on public.follows;
create trigger follows_guard_upd
  before update on public.follows
  for each row execute function public.follows_guard();

grant select, insert, update, delete on public.follows to authenticated;

drop view if exists public.follow_activity;
create view public.follow_activity
with (security_invoker = on) as
  select
    f.user_id,
    f.owner,
    f.repo,
    f.last_seen_at,
    f.created_at,
    (
      select count(*) from public.reports r
       where r.owner = f.owner and r.repo = f.repo
    ) as report_count,
    (
      select max(r.updated_at) from public.reports r
       where r.owner = f.owner and r.repo = f.repo
    ) as last_report_at,
    (
      select r.score from public.reports r
       where r.owner = f.owner and r.repo = f.repo and r.kind = 'security-score'
    ) as score,
    (
      select count(*) from public.reports r
       where r.owner = f.owner and r.repo = f.repo and r.updated_at > f.last_seen_at
    ) as new_reports,
    (
      select count(*) from public.comments c
        join public.reports r on r.id = c.report_id
       where r.owner = f.owner and r.repo = f.repo
         and c.deleted_at is null
         and c.created_at > f.last_seen_at
    ) as new_comments
  from public.follows f;

grant select on public.follow_activity to authenticated;

select 'follows table' as step,
       case when exists (
         select 1 from information_schema.tables
          where table_schema = 'public' and table_name = 'follows'
       ) then 'ready' else 'MISSING' end as result
union all
select 'row level security',
       case when (
         select relrowsecurity from pg_class where oid = 'public.follows'::regclass
       ) then 'on' else 'OFF - do not use' end
union all
select 'activity view is caller-scoped',
       case when exists (
         select 1 from pg_class c
          where c.relname = 'follow_activity'
            and c.reloptions @> array['security_invoker=on']
       ) then 'yes' else 'NO - it would leak' end;
