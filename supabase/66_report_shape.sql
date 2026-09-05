delete from public.reports
 where owner !~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$'
    or (repo <> '' and repo !~ '^[A-Za-z0-9._-]{1,100}$');

alter table public.reports drop constraint if exists reports_owner_shape;
alter table public.reports
  add constraint reports_owner_shape
  check (owner ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$');

alter table public.reports drop constraint if exists reports_repo_shape;
alter table public.reports
  add constraint reports_repo_shape
  check (repo = '' or repo ~ '^[A-Za-z0-9._-]{1,100}$');

alter table public.posts drop constraint if exists posts_repo_owner_shape;
alter table public.posts
  add constraint posts_repo_owner_shape
  check (repo_owner = '' or repo_owner ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$');

alter table public.posts drop constraint if exists posts_repo_name_shape;
alter table public.posts
  add constraint posts_repo_name_shape
  check (repo_name = '' or repo_name ~ '^[A-Za-z0-9._-]{1,100}$');

select 'a report cannot hold markup in its owner' as step,
       case when exists (select 1 from pg_constraint
         where conrelid='public.reports'::regclass and conname='reports_owner_shape')
       then 'ready' else 'MISSING' end as result
union all
select 'nor in its repository name',
       case when exists (select 1 from pg_constraint
         where conrelid='public.reports'::regclass and conname='reports_repo_shape')
       then 'ready' else 'MISSING' end
union all
select 'a post cannot either',
       case when (select count(*) from pg_constraint
         where conrelid='public.posts'::regclass
           and conname in ('posts_repo_owner_shape','posts_repo_name_shape')) = 2
       then 'ready' else 'MISSING' end
union all
select 'nothing malformed survived',
       case when not exists (select 1 from public.reports
         where owner !~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$')
       then 'clean' else 'STILL THERE' end;
