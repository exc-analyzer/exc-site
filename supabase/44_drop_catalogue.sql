drop trigger if exists catalog_suppression_ins on public.catalog_repos;
drop function if exists public.catalog_respect_suppression();
drop view if exists public.catalog_languages;
drop table if exists public.catalog_repos;

select 'catalogue mirror gone' as step,
       case when not exists (select 1 from information_schema.tables
         where table_schema='public' and table_name='catalog_repos')
         then 'clean' else 'STILL THERE' end as result;
