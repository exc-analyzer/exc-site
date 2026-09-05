do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and array_to_string(p.proacl, ',') like '=X/%'
  loop
    execute format('revoke execute on function %s from public', fn.sig);
  end loop;
end;
$$;

alter default privileges in schema public revoke execute on functions from public;

select 'functions still open to PUBLIC' as step,
       coalesce((
         select string_agg(p.proname, ', ')
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.prokind='f'
            and array_to_string(p.proacl, ',') like '=X/%'
       ), 'none') as result
union all
select 'the purge is owner-only now',
       case when not exists (
         select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='purge_expired_reports'
            and array_to_string(p.proacl, ',') like '=X/%')
       then 'closed' else 'STILL OPEN' end
union all
select 'the app can still read a report card',
       case when exists (
         select 1 from information_schema.role_routine_grants
          where routine_schema='public' and routine_name='scan_author_shown'
            and grantee='anon')
       then 'ready' else 'BROKEN' end
union all
select 'moderators can still work',
       case when exists (
         select 1 from information_schema.role_routine_grants
          where routine_schema='public' and routine_name='moderation_queue'
            and grantee='authenticated')
       then 'ready' else 'BROKEN' end;
