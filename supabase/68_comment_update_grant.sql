grant update (body, deleted_at, vote_score) on public.comments to authenticated;

create or replace function public.reports_respect_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_suppressed(new.owner) then
    raise exception 'This repository cannot be published here.';
  end if;
  return new;
end;
$$;

select 'a person can still edit and delete their comment' as step,
       case when (select count(*) from information_schema.column_privileges
          where table_schema='public' and table_name='comments'
            and column_name in ('body','deleted_at') and grantee='authenticated'
            and privilege_type='UPDATE') = 2
       then 'ready' else 'BROKEN' end as result
union all
select 'the pin flag is out of reach',
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='comments'
            and column_name='pinned_at' and grantee='authenticated'
            and privilege_type='UPDATE')
       then 'closed' else 'STILL OPEN' end
union all
select 'the suppression list no longer answers probes',
       case when pg_get_functiondef(p.oid) not like '%asked not to be listed%'
            then 'closed' else 'STILL OPEN' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='reports_respect_suppression'
union all
select 'an abandoned report cannot be seized',
       case when (select qual::text from pg_policies
                   where schemaname='public' and tablename='reports' and cmd='UPDATE')
                 not like '%is null%'
       then 'ready' else 'STILL OPEN' end;
