create index if not exists reports_created_by_idx on public.reports (created_by);

create index if not exists people_follows_pair_idx
  on public.people_follows (followee_id, follower_id);

drop index if exists public.people_follows_followee_idx;

analyze public.reports;
analyze public.people_follows;

select 'reports by author' as step,
       case when exists (select 1 from pg_indexes
         where schemaname = 'public' and indexname = 'reports_created_by_idx')
         then 'ready' else 'MISSING' end as result
union all
select 'follow pair lookup',
       case when exists (select 1 from pg_indexes
         where schemaname = 'public' and indexname = 'people_follows_pair_idx')
         then 'ready' else 'MISSING' end
union all
select 'redundant single-column index gone',
       case when not exists (select 1 from pg_indexes
         where schemaname = 'public' and indexname = 'people_follows_followee_idx')
         then 'clean' else 'STILL THERE' end;
