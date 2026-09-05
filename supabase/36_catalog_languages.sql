drop view if exists public.catalog_languages;
create view public.catalog_languages as
  select language, count(*)::int as repos
    from public.catalog_repos
   where language is not null
   group by language
   order by count(*) desc;

grant select on public.catalog_languages to anon, authenticated;

select language, repos from public.catalog_languages limit 8;
