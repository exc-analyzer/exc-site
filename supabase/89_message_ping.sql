drop policy if exists "you receive only your own pings" on realtime.messages;
create policy "you receive only your own pings"
  on realtime.messages for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = 'mail:' || (select auth.uid())::text
  );

create or replace function public.messages_ping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform realtime.send(jsonb_build_object('kind', 'arrived'), 'mail',
                            'mail:' || new.to_id::text, true);
    elsif new.deleted_at is distinct from old.deleted_at then
      perform realtime.send(jsonb_build_object('kind', 'changed'), 'mail',
                            'mail:' || new.to_id::text, true);
      perform realtime.send(jsonb_build_object('kind', 'changed'), 'mail',
                            'mail:' || new.from_id::text, true);
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists messages_ping_ins on public.messages;
create trigger messages_ping_ins
  after insert on public.messages
  for each row execute function public.messages_ping();

drop trigger if exists messages_ping_upd on public.messages;
create trigger messages_ping_upd
  after update on public.messages
  for each row execute function public.messages_ping();

create or replace function public.unread_mail()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(count(*), 0)::integer
    from public.messages m
   where m.to_id = (select auth.uid())
     and m.read_at is null
     and m.deleted_at is null;
$$;

revoke execute on function public.unread_mail() from public;
grant execute on function public.unread_mail() to authenticated;

select 'only your own channel reaches you' as step,
       case when exists (select 1 from pg_policies
              where schemaname='realtime' and tablename='messages'
                and qual like '%auth.uid()%')
       then 'ready' else 'MISSING' end as result
union all
select 'a new message pings the recipient',
       case when exists (select 1 from pg_trigger
              where tgrelid = 'public.messages'::regclass and tgname = 'messages_ping_ins')
       then 'ready' else 'MISSING' end
union all
select 'the ping carries no message text',
       case when pg_get_functiondef(p.oid) not like '%new.body%'
            then 'ready' else 'LEAKS BODY' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='messages_ping';
