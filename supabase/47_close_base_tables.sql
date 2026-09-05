alter view public.feed           set (security_invoker = off);
alter view public.report_card    set (security_invoker = off);
alter view public.member_profile set (security_invoker = off);

revoke select on public.reports from anon;
revoke select on public.posts   from anon;

revoke select (created_by) on public.reports from authenticated;

drop policy if exists "reports are publicly readable" on public.reports;
create policy "reports are readable unless taken down"
  on public.reports for select
  using (
    hidden_at is null
    or created_by = (select auth.uid())
  );

drop policy if exists "posts are publicly readable" on public.posts;
create policy "posts are readable unless removed or private"
  on public.posts for select
  using (
    author_id = (select auth.uid())
    or (
      deleted_at is null
      and exists (
        select 1
          from public.profiles p
         where p.id = posts.author_id
           and (not coalesce(p.private_account, false) or public.sees_private(p.id))
      )
    )
  );

select 'anon cannot read reports' as step,
       case when not exists (
         select 1 from information_schema.role_table_grants
          where table_schema='public' and table_name='reports'
            and grantee='anon' and privilege_type='SELECT')
       then 'closed' else 'STILL OPEN' end as result
union all
select 'anon cannot read posts',
       case when not exists (
         select 1 from information_schema.role_table_grants
          where table_schema='public' and table_name='posts'
            and grantee='anon' and privilege_type='SELECT')
       then 'closed' else 'STILL OPEN' end
union all
select 'scanner identity column closed',
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='reports'
            and column_name='created_by' and grantee in ('anon','authenticated')
            and privilege_type='SELECT')
       then 'closed' else 'STILL OPEN' end
union all
select 'public views no longer need the caller to hold base rights',
       case when (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='public' and c.relkind='v'
                     and c.relname in ('feed','report_card','member_profile')
                     and 'security_invoker=on' = any(c.reloptions)) = 0
       then 'ready' else 'MISSING' end
union all
select 'taken-down scans hidden at the table',
       case when (select qual::text from pg_policies
                   where schemaname='public' and tablename='reports' and cmd='SELECT')
                 like '%hidden_at%'
       then 'ready' else 'MISSING' end
union all
select 'removed and private posts hidden at the table',
       case when (select qual::text from pg_policies
                   where schemaname='public' and tablename='posts' and cmd='SELECT')
                 like '%private_account%'
       then 'ready' else 'MISSING' end;
