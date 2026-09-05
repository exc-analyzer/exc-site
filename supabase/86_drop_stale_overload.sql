drop function if exists public.moderate_remove(text, uuid, text);

select 'only one take-down function remains' as step,
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname='moderate_remove') = 1
       then 'ready' else 'STILL TWO' end as result
union all
select 'and it handles messages',
       case when pg_get_functiondef(p.oid) like '%public.messages set deleted_at%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='moderate_remove';
