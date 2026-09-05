create extension if not exists pg_cron with schema extensions;

create or replace function public.purge_expired_reports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  gone integer;
begin
  delete from public.reports
   where updated_at < now() - interval '90 days'
     and hidden_at is null;
  get diagnostics gone = row_count;

  delete from public.reports
   where hidden_at is not null
     and hidden_at < now() - interval '30 days';

  return gone;
end;
$$;

revoke execute on function public.purge_expired_reports() from anon, authenticated;

select cron.unschedule('purge-expired-reports')
 where exists (select 1 from cron.job where jobname = 'purge-expired-reports');

select cron.schedule(
  'purge-expired-reports',
  '17 3 * * *',
  $job$ select public.purge_expired_reports(); $job$
);

select 'scheduler installed' as step,
       case when exists (select 1 from pg_extension where extname='pg_cron')
            then 'ready' else 'MISSING' end as result
union all
select 'purge function',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='purge_expired_reports')
            then 'ready' else 'MISSING' end
union all
select 'nobody can call it from the browser',
       case when not exists (
         select 1 from information_schema.role_routine_grants
          where routine_schema='public' and routine_name='purge_expired_reports'
            and grantee in ('anon','authenticated'))
            then 'closed' else 'STILL OPEN' end
union all
select 'runs nightly',
       coalesce((select schedule from cron.job where jobname='purge-expired-reports'), 'MISSING');
