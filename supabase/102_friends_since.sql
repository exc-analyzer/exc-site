create or replace function public.friends_since(other uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null or other is null then null
    when exists (
      select 1 from public.blocks b
       where (b.blocker_id = (select auth.uid()) and b.blocked_id = other)
          or (b.blocker_id = other and b.blocked_id = (select auth.uid()))
    ) then null
    else (
      select greatest(mine.created_at, theirs.created_at)
        from public.people_follows mine, public.people_follows theirs
       where mine.follower_id = (select auth.uid())
         and mine.followee_id = other
         and theirs.follower_id = other
         and theirs.followee_id = (select auth.uid())
    )
  end;
$$;

revoke execute on function public.friends_since(uuid) from public, anon;
grant execute on function public.friends_since(uuid) to authenticated;

select 'it answers only about the caller' as step,
       case when pg_get_functiondef(p.oid) like '%mine.follower_id = (select auth.uid())%'
       then 'ready' else 'MISSING' end as result
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='friends_since'
union all
select 'a block hides the date',
       case when pg_get_functiondef(p.oid) like '%public.blocks%'
       then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='friends_since'
union all
select 'anonymous cannot call it',
       case when has_function_privilege('anon', 'public.friends_since(uuid)', 'execute')
       then 'OPEN' else 'closed' end;
