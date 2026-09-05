create table if not exists public.catalog_repos (
  owner        text        not null,
  repo         text        not null,
  description  text,
  stars        integer     not null default 0,
  language     text,
  avatar_url   text,
  topics       text[]      not null default '{}',
  pushed_at    timestamptz,
  refreshed_at timestamptz not null default now(),

  primary key (owner, repo)
);

create index if not exists catalog_stars_idx on public.catalog_repos (stars desc);
create index if not exists catalog_language_idx on public.catalog_repos (language, stars desc);

alter table public.catalog_repos enable row level security;

drop policy if exists "the catalogue is public reading" on public.catalog_repos;
create policy "the catalogue is public reading"
  on public.catalog_repos for select
  using (true);

revoke all on public.catalog_repos from anon, authenticated;
grant select on public.catalog_repos to anon, authenticated;

select 'catalogue table' as step,
       case when exists (select 1 from information_schema.tables
         where table_schema='public' and table_name='catalog_repos')
         then 'ready' else 'MISSING' end as result
union all
select 'read only for visitors',
       case when not exists (
         select 1 from information_schema.role_table_grants
          where table_schema='public' and table_name='catalog_repos'
            and grantee in ('anon','authenticated')
            and privilege_type in ('INSERT','UPDATE','DELETE'))
         then 'locked' else 'OPEN' end;
