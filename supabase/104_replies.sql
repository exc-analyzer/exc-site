alter table public.messages
  add column if not exists reply_to uuid references public.messages (id) on delete set null;

create index if not exists messages_reply_to_idx on public.messages (reply_to);

revoke select on public.messages from authenticated;
grant select (id, from_id, to_id, body, created_at, read_at, deleted_at, reply_to)
  on public.messages to authenticated;
grant insert (from_id, to_id, body, reply_to) on public.messages to authenticated;

create or replace function public.messages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
  mutual boolean;
  ok boolean;
begin
  if tg_op = 'INSERT' then
    if exists (
      select 1 from public.blocks b
       where (b.blocker_id = new.from_id and b.blocked_id = new.to_id)
          or (b.blocker_id = new.to_id and b.blocked_id = new.from_id)
    ) then
      raise exception 'There is a block between you two.';
    end if;

    select exists (select 1 from public.people_follows f
                    where f.follower_id = new.from_id and f.followee_id = new.to_id)
       and exists (select 1 from public.people_follows f
                    where f.follower_id = new.to_id and f.followee_id = new.from_id)
      into mutual;

    if not mutual then
      raise exception 'You can only message someone who follows you back.';
    end if;

    if new.reply_to is not null then
      select exists (
        select 1 from public.messages m
         where m.id = new.reply_to
           and ((m.from_id = new.from_id and m.to_id = new.to_id)
             or (m.from_id = new.to_id and m.to_id = new.from_id))
      ) into ok;
      if not ok then
        raise exception 'You can only reply to a message in this conversation.';
      end if;
    end if;

    new.created_at  := now();
    new.read_at     := null;
    new.deleted_at  := null;
    new.reported_at := null;

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
    new.reply_to   := old.reply_to;

    if coalesce(current_setting('app.internal', true), 'off') = 'on' then
      if new.body is distinct from old.body and new.body <> '[removed]' then
        raise exception 'A message cannot be edited once it is sent.';
      end if;
      return new;
    end if;

    new.read_at     := old.read_at;
    new.reported_at := old.reported_at;

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

select 'a reply must stay in its conversation' as step,
       case when pg_get_functiondef(p.oid) like '%reply to a message in this conversation%'
       then 'ready' else 'MISSING' end as result
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='messages_guard'
union all
select 'and cannot be repointed later',
       case when pg_get_functiondef(p.oid) like '%new.reply_to   := old.reply_to%'
       then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='messages_guard'
union all
select 'columns a member may write',
       (select string_agg(privilege_type || '(' || column_name || ')', ', '
                          order by privilege_type, column_name)
          from information_schema.column_privileges
         where table_schema='public' and table_name='messages'
           and grantee='authenticated' and privilege_type in ('INSERT','UPDATE'));
