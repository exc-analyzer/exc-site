delete from public.reports where kind in ('user-analysis', 'user-anomaly');

alter table public.reports
  drop constraint if exists reports_kind_allowed;

alter table public.reports
  add constraint reports_kind_allowed check (
    kind in (
      'analysis',
      'security-score',
      'content-audit',
      'contrib-impact',
      'file-history',
      'actions-audit',
      'commit-anomaly'
    )
  );

alter table public.catalog_repos
  drop column if exists description,
  drop column if exists avatar_url;

drop view if exists public.catalog_languages;
create view public.catalog_languages as
  select language, count(*)::int as repos
    from public.catalog_repos
   where language is not null
   group by language
   order by count(*) desc;

grant select on public.catalog_languages to anon, authenticated;

select 'person reports refused by the database' as step,
       case when not exists (
         select 1 from information_schema.check_constraints
          where constraint_schema = 'public'
            and constraint_name = 'reports_kind_allowed'
            and check_clause like '%user-analysis%'
       ) then 'ready' else 'STILL ALLOWED' end as result
union all
select 'no person reports left',
       case when not exists (select 1 from public.reports
              where kind in ('user-analysis','user-anomaly'))
            then 'clean' else 'STILL THERE' end
union all
select 'catalogue no longer mirrors text or avatars',
       case when not exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='catalog_repos'
                and column_name in ('description','avatar_url'))
            then 'clean' else 'STILL THERE' end;
