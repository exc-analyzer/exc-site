create table if not exists public.reports (
  id          uuid        primary key default gen_random_uuid(),
  owner       text        not null check (char_length(owner) between 1 and 100),

  repo        text        not null check (char_length(repo) <= 200),
  kind        text        not null,

  score       integer     check (score is null or score between 0 and 100),
  summary     jsonb       not null,
  scan_count  integer     not null default 1,
  created_by  uuid        references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (owner, repo, kind),

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

  constraint reports_summary_size check (pg_column_size(summary) <= 100000)
);

create index if not exists reports_owner_repo_idx on public.reports (owner, repo);
create index if not exists reports_updated_idx    on public.reports (updated_at desc);
create index if not exists reports_score_idx      on public.reports (score desc) where score is not null;

alter table public.reports enable row level security;

drop policy if exists "reports are publicly readable" on public.reports;
create policy "reports are publicly readable"
  on public.reports for select
  using (true);

drop policy if exists "signed in user writes a report" on public.reports;
create policy "signed in user writes a report"
  on public.reports for insert
  with check ((select auth.uid()) = created_by);

drop policy if exists "signed in user refreshes a report" on public.reports;
create policy "signed in user refreshes a report"
  on public.reports for update
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) = created_by);

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
    raise exception 'Hourly report limit reached. Try again a little later.';
  end if;

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

grant select on public.reports to anon, authenticated;
grant insert, update on public.reports to authenticated;
