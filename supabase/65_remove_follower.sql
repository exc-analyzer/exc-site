drop policy if exists "user unfollows people" on public.people_follows;

create policy "either side can end a follow"
  on public.people_follows for delete
  using (
    (select auth.uid()) = follower_id
    or (select auth.uid()) = followee_id
  );

select 'a person can drop a follower' as step,
       case when (select qual::text from pg_policies
                   where schemaname='public' and tablename='people_follows' and cmd='DELETE')
                 like '%followee_id%'
       then 'ready' else 'MISSING' end as result
union all
select 'unfollowing still works',
       case when (select qual::text from pg_policies
                   where schemaname='public' and tablename='people_follows' and cmd='DELETE')
                 like '%follower_id%'
       then 'ready' else 'MISSING' end;
