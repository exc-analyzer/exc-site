revoke select on public.reports from authenticated;

grant select (
  id, owner, repo, kind, score, summary, scan_count,
  created_at, updated_at, author_visibility,
  hidden_at, disputed_at, disputed_note
) on public.reports to authenticated;

select 'scanner identity column closed' as step,
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='reports'
            and column_name='created_by' and grantee in ('anon','authenticated')
            and privilege_type='SELECT')
       then 'closed' else 'STILL OPEN' end as result
union all
select 'a signed-in reader can still read the scan itself',
       case when exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='reports'
            and column_name='summary' and grantee='authenticated'
            and privilege_type='SELECT')
       then 'ready' else 'MISSING' end;
