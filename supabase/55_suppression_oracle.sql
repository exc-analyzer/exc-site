revoke execute on function public.is_suppressed(text) from anon, authenticated;

select 'the suppression list is no longer queryable' as step,
       case when not exists (
         select 1 from information_schema.role_routine_grants
          where routine_schema='public' and routine_name='is_suppressed'
            and grantee in ('anon','authenticated'))
       then 'closed' else 'STILL OPEN' end as result
union all
select 'the guard still refuses a suppressed owner',
       case when exists (select 1 from pg_trigger
         where tgname = 'reports_suppression_ins' and not tgisinternal)
       then 'ready' else 'MISSING' end;
