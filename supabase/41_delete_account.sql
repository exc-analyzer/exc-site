create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;

  delete from public.profiles where id = me;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

select 'account deletion' as step,
       case when exists (select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='delete_my_account')
         then 'ready' else 'MISSING' end as result
union all
select 'anonymous cannot call it',
       case when not has_function_privilege('anon',
              'public.delete_my_account()', 'execute')
            then 'locked' else 'OPEN' end;
