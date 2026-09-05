create or replace function public.mark_conversation_read(other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  touched integer;
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;

  perform set_config('app.internal', 'on', true);

  update public.messages
     set read_at = now()
   where to_id = me
     and from_id = other
     and read_at is null;

  get diagnostics touched = row_count;

  perform set_config('app.internal', 'off', true);

  if touched > 0 then
    perform public.nudge(other);
  end if;
end;
$$;

revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

select 'reading tells the sender' as step,
       case when pg_get_functiondef(p.oid) like '%nudge(other)%'
       then 'ready' else 'MISSING' end as result
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='mark_conversation_read'
union all
select 'only when something actually changed',
       case when pg_get_functiondef(p.oid) like '%touched > 0%'
       then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='mark_conversation_read'
union all
select 'the read mark is still server-owned',
       coalesce((select string_agg(column_name, ', ')
                   from information_schema.column_privileges
                  where table_schema='public' and table_name='messages'
                    and grantee='authenticated' and privilege_type='UPDATE'), 'none');
