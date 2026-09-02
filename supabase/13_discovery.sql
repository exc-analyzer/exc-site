create table if not exists public.report_scores (
  report_id  uuid        not null references public.reports (id) on delete cascade,
  score      integer     not null check (score between 0 and 100),
  recorded_at timestamptz not null default now(),

  primary key (report_id, recorded_at)
);

create index if not exists report_scores_report_idx on public.report_scores (report_id, recorded_at);

alter table public.report_scores enable row level security;

drop policy if exists "score history is publicly readable" on public.report_scores;
create policy "score history is publicly readable"
  on public.report_scores for select
  using (true);

grant select on public.report_scores to anon, authenticated;

create or replace function public.record_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.score is not null and (tg_op = 'INSERT' or new.score is distinct from old.score) then
    insert into public.report_scores (report_id, score)
    values (new.id, new.score)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists reports_record_score on public.reports;
create trigger reports_record_score
  after insert or update on public.reports
  for each row execute function public.record_score();

insert into public.report_scores (report_id, score, recorded_at)
select r.id, r.score, r.created_at
  from public.reports r
 where r.score is not null
   and not exists (select 1 from public.report_scores h where h.report_id = r.id)
on conflict do nothing;

drop view if exists public.explore;
create view public.explore
with (security_invoker = on) as
  select
    r.owner,
    r.repo,
    r.kind,
    r.score,
    r.scan_count,
    r.updated_at,
    (select h.score from public.report_scores h
      where h.report_id = r.id order by h.recorded_at asc limit 1) as first_score,
    r.score - (select h.score from public.report_scores h
      where h.report_id = r.id order by h.recorded_at asc limit 1) as improvement,
    (select count(*) from public.comments c
      where c.report_id = r.id and c.deleted_at is null) as replies,
    public.like_count('report', r.id) as likes
  from public.reports r
  where r.repo <> '';

grant select on public.explore to anon, authenticated;

select 'score history' as step,
       case when exists (select 1 from information_schema.tables
         where table_schema='public' and table_name='report_scores')
         then 'ready' else 'MISSING' end as result
union all
select 'rows recorded', (select count(*) from public.report_scores)::text
union all
select 'explore rows', (select count(*) from public.explore)::text
union all
select 'history is read only for members',
       case when has_table_privilege('authenticated', 'public.report_scores', 'INSERT')
            then 'NO - members can write history' else 'yes' end
union all
select 'explore view is caller-scoped',
       case when exists (select 1 from pg_class c
         where c.relname = 'explore' and c.reloptions @> array['security_invoker=on'])
         then 'yes' else 'NO - it would leak' end;
