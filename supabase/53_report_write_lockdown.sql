drop policy if exists "signed in user refreshes a report" on public.reports;

create policy "a scanner refreshes only a report that is theirs"
  on public.reports for update
  using (
    created_by = (select auth.uid())
    or created_by is null
  )
  with check (created_by = (select auth.uid()));

revoke update on public.reports from authenticated;

grant update (owner, repo, kind, score, summary, created_by, author_visibility)
  on public.reports to authenticated;

do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format(
      'revoke truncate, references, trigger on public.%I from anon, authenticated',
      t.relname
    );
  end loop;
end;
$$;

alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

select 'a report can no longer be seized' as step,
       case when (select qual::text from pg_policies
                   where schemaname='public' and tablename='reports' and cmd='UPDATE')
                 like '%created_by%'
       then 'closed' else 'STILL OPEN' end as result
union all
select 'moderation flags are out of reach',
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='reports'
            and column_name in ('hidden_at','disputed_at','disputed_note')
            and grantee='authenticated' and privilege_type='UPDATE')
       then 'closed' else 'STILL OPEN' end
union all
select 'a scanner can still refresh and rename their own scan',
       case when (select count(*) from information_schema.column_privileges
          where table_schema='public' and table_name='reports'
            and column_name in ('summary','score','author_visibility')
            and grantee='authenticated' and privilege_type='UPDATE') = 3
       then 'ready' else 'BROKEN' end
union all
select 'nobody can wipe a table any more',
       case when not exists (
         select 1 from information_schema.role_table_grants
          where table_schema='public' and grantee in ('anon','authenticated')
            and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER'))
       then 'closed' else 'STILL OPEN' end;
