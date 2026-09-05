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
  where r.repo <> ''
    and r.hidden_at is null
    and r.updated_at > now() - interval '90 days';

grant select on public.explore to anon, authenticated;

select 'boards drop stale scores' as step,
       case when exists (select 1 from pg_views where schemaname='public'
         and viewname='explore' and definition like '%90 days%')
         then 'ready' else 'MISSING' end as result
union all
select 'rows still on the boards',
       (select count(*)::text from public.explore);
