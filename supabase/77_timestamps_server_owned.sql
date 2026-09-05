revoke insert (created_at) on public.abuse_reports from anon, authenticated;
revoke insert (id, status)  on public.abuse_reports from anon, authenticated;

revoke insert (created_at) on public.bookmarks       from anon, authenticated;
revoke insert (created_at) on public.follow_requests from anon, authenticated;
revoke insert (created_at) on public.people_follows  from anon, authenticated;
revoke insert (created_at) on public.votes           from anon, authenticated;

revoke insert (created_at)          on public.follows from anon, authenticated;
revoke update (created_at)          on public.follows from anon, authenticated;
revoke insert (created_at)          on public.pinned_repos from anon, authenticated;
revoke update (created_at)          on public.pinned_repos from anon, authenticated;

revoke insert (id, created_at, status, handled_at) on public.feedback from anon, authenticated;

revoke insert on public.profiles from anon, authenticated;

select 'a record cannot be backdated' as step,
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and grantee in ('anon','authenticated')
            and privilege_type in ('INSERT','UPDATE') and column_name = 'created_at')
       then 'closed' else 'STILL OPEN' end as result
union all
select 'feedback cannot arrive pre-handled',
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='feedback'
            and grantee in ('anon','authenticated') and privilege_type='INSERT'
            and column_name in ('status','handled_at','id'))
       then 'closed' else 'STILL OPEN' end
union all
select 'a report cannot arrive pre-settled',
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='abuse_reports'
            and grantee in ('anon','authenticated') and privilege_type='INSERT'
            and column_name in ('status','id'))
       then 'closed' else 'STILL OPEN' end
union all
select 'people can still send feedback and report abuse',
       case when (select count(*) from information_schema.column_privileges
          where table_schema='public' and grantee='authenticated' and privilege_type='INSERT'
            and ((table_name='feedback' and column_name in ('author_id','kind','body'))
              or (table_name='abuse_reports' and column_name in ('target_type','target_id','reporter_id','reason')))) = 7
       then 'ready' else 'BROKEN' end;
