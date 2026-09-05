create or replace function public.sees_private(owner uuid)
returns boolean
language sql
stable
as $$
  select coalesce(owner = (select auth.uid()), false)
      or exists (
           select 1
             from public.people_follows f
            where f.followee_id = owner
              and f.follower_id = (select auth.uid())
         );
$$;

select 'anonymous gets false, not null' as step,
       case when public.sees_private('00000000-0000-0000-0000-000000000001') is false
            then 'ready' else 'STILL NULL' end as result;
