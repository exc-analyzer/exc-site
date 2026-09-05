drop view if exists public.explore;

select 'boards view gone' as step,
       case when not exists (select 1 from information_schema.views
         where table_schema='public' and table_name='explore')
         then 'clean' else 'STILL THERE' end as result;
