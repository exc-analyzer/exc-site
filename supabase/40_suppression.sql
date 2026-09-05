create table if not exists public.suppressed_owners (
  gh_login   text        primary key,
  reason     text,
  created_at timestamptz not null default now()
);

alter table public.suppressed_owners enable row level security;

revoke all on public.suppressed_owners from anon, authenticated;

create or replace function public.is_suppressed(login text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.suppressed_owners s
     where lower(s.gh_login) = lower(login)
  );
$$;

grant execute on function public.is_suppressed(text) to anon, authenticated;

create or replace function public.reports_respect_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_suppressed(new.owner) then
    raise exception 'This owner asked not to be listed here.';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_suppression_ins on public.reports;
create trigger reports_suppression_ins
  before insert or update on public.reports
  for each row execute function public.reports_respect_suppression();

create or replace function public.catalog_respect_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_suppressed(new.owner) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_suppression_ins on public.catalog_repos;
create trigger catalog_suppression_ins
  before insert or update on public.catalog_repos
  for each row execute function public.catalog_respect_suppression();

create or replace function public.suppress_owner(login text, why text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  insert into public.suppressed_owners (gh_login, reason)
  values (login, why)
  on conflict (gh_login) do update set reason = excluded.reason;

  delete from public.reports where lower(owner) = lower(login);
  delete from public.catalog_repos where lower(owner) = lower(login);
end;
$$;

grant execute on function public.suppress_owner(text, text) to authenticated;

select 'suppression list' as step,
       case when exists (select 1 from information_schema.tables
         where table_schema='public' and table_name='suppressed_owners')
         then 'ready' else 'MISSING' end as result
union all
select 'reports refuse a suppressed owner',
       case when exists (select 1 from pg_trigger
         where tgname = 'reports_suppression_ins' and not tgisinternal)
         then 'ready' else 'MISSING' end
union all
select 'catalogue skips a suppressed owner',
       case when exists (select 1 from pg_trigger
         where tgname = 'catalog_suppression_ins' and not tgisinternal)
         then 'ready' else 'MISSING' end;
