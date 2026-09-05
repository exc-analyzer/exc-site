create or replace function public.follow_is_mutual(one uuid, two uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.people_follows f
     where f.follower_id = one and f.followee_id = two
  ) and exists (
    select 1 from public.people_follows f
     where f.follower_id = two and f.followee_id = one
  );
$$;

revoke execute on function public.follow_is_mutual(uuid, uuid) from public;
grant execute on function public.follow_is_mutual(uuid, uuid) to authenticated;

create table if not exists public.messages (
  id          uuid        primary key default gen_random_uuid(),
  from_id     uuid        not null references public.profiles (id) on delete cascade,
  to_id       uuid        not null references public.profiles (id) on delete cascade,
  body        text        not null check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  deleted_at  timestamptz,
  reported_at timestamptz,
  constraint messages_not_self check (from_id <> to_id)
);

alter table public.messages enable row level security;

create index if not exists messages_pair_idx
  on public.messages (least(from_id, to_id), greatest(from_id, to_id), created_at desc);
create index if not exists messages_unread_idx
  on public.messages (to_id, read_at) where read_at is null;

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (from_id, to_id, body) on public.messages to authenticated;
grant update (deleted_at, body) on public.messages to authenticated;

create policy "you read only your own conversations"
  on public.messages for select to authenticated
  using (from_id = (select auth.uid()) or to_id = (select auth.uid()));

create policy "you write as yourself"
  on public.messages for insert to authenticated
  with check (from_id = (select auth.uid()));

create policy "you can take back what you sent"
  on public.messages for update to authenticated
  using (from_id = (select auth.uid()))
  with check (from_id = (select auth.uid()));

create or replace function public.messages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  if tg_op = 'INSERT' then
    if not public.follow_is_mutual(new.from_id, new.to_id) then
      raise exception 'You can only message someone who follows you back.';
    end if;

    select count(*) into recent
      from public.messages m
     where m.from_id = new.from_id
       and m.created_at > now() - interval '1 hour';

    if recent >= 120 then
      raise exception 'That is a lot of messages in one hour. Try again a bit later.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.from_id    := old.from_id;
    new.to_id      := old.to_id;
    new.created_at := old.created_at;
    new.read_at    := old.read_at;

    if old.deleted_at is not null then
      raise exception 'This message has been taken back already.';
    end if;

    if new.deleted_at is not null then
      new.body := '[taken back]';
    elsif new.body is distinct from old.body then
      raise exception 'A message cannot be edited once it is sent.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_guard_ins on public.messages;
create trigger messages_guard_ins
  before insert or update on public.messages
  for each row execute function public.messages_guard();

select 'the table is there' as step,
       case when exists (select 1 from information_schema.tables
         where table_schema='public' and table_name='messages')
       then 'ready' else 'MISSING' end as result
union all
select 'nobody signed out can touch it',
       case when not exists (
         select 1 from information_schema.role_table_grants
          where table_schema='public' and table_name='messages' and grantee='anon')
       then 'closed' else 'STILL OPEN' end
union all
select 'you may only read your own',
       case when (select qual::text from pg_policies
                   where schemaname='public' and tablename='messages' and cmd='SELECT')
                 like '%auth.uid%' then 'ready' else 'MISSING' end
union all
select 'a stranger cannot be messaged',
       case when pg_get_functiondef(p.oid) like '%follows you back%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='messages_guard';
