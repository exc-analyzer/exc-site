alter table public.profiles
  add column if not exists tour_seen_at timestamptz;

drop function if exists public.my_terms_state();

create function public.my_first_run()
returns table (
  accepted_at timestamptz,
  version     text,
  tour_seen   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.terms_accepted_at, p.terms_version, p.tour_seen_at
    from public.profiles p
   where p.id = (select auth.uid());
$$;

create or replace function public.finish_tour()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.';
  end if;

  update public.profiles
     set tour_seen_at = coalesce(tour_seen_at, now())
   where id = (select auth.uid());
end;
$$;

revoke execute on function public.my_first_run() from public;
revoke execute on function public.finish_tour() from public;
grant execute on function public.my_first_run() to authenticated;
grant execute on function public.finish_tour() to authenticated;

select 'tour flag' as step,
       case when exists (select 1 from information_schema.columns
         where table_schema='public' and table_name='profiles' and column_name='tour_seen_at')
       then 'ready' else 'MISSING' end as result
union all
select 'first-run state in one call',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='my_first_run')
       then 'ready' else 'MISSING' end
union all
select 'closed to signed-out callers',
       case when not exists (
         select 1 from information_schema.role_routine_grants
          where routine_schema='public' and routine_name in ('my_first_run','finish_tour')
            and grantee='anon')
       then 'closed' else 'STILL OPEN' end;
