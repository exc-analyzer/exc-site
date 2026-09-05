create or replace function public.messages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
  mutual boolean;
begin
  if tg_op = 'INSERT' then
    select exists (select 1 from public.people_follows f
                    where f.follower_id = new.from_id and f.followee_id = new.to_id)
       and exists (select 1 from public.people_follows f
                    where f.follower_id = new.to_id and f.followee_id = new.from_id)
      into mutual;

    if not mutual then
      raise exception 'You can only message someone who follows you back.';
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

create or replace function public.mark_conversation_read(other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.';
  end if;

  perform set_config('app.internal', 'on', true);

  update public.messages
     set read_at = now()
   where to_id = (select auth.uid())
     and from_id = other
     and read_at is null;

  perform set_config('app.internal', 'off', true);
end;
$$;

create or replace function public.report_message(message uuid, why text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ok boolean;
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;

  if char_length(btrim(coalesce(why, ''))) < 3 then
    raise exception 'Say briefly what is wrong with it.';
  end if;

  select exists (
    select 1 from public.messages m where m.id = message and m.to_id = me
  ) into ok;

  if not ok then
    raise exception 'You can only report a message somebody sent you.';
  end if;

  perform set_config('app.internal', 'on', true);
  update public.messages set reported_at = now() where id = message;
  perform set_config('app.internal', 'off', true);

  insert into public.abuse_reports (target_type, target_id, reporter_id, reason)
  values ('message', message, me, btrim(why));
end;
$$;

create or replace function public.moderate_remove(kind text, subject uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  if kind = 'comment' then
    update public.comments set deleted_at = now(), body = '[removed]' where id = subject;
  elsif kind = 'post' then
    update public.posts set deleted_at = now(), body = '[removed]' where id = subject;
  elsif kind = 'report' then
    update public.reports set hidden_at = now() where id = subject;
  elsif kind = 'message' then
    perform set_config('app.internal', 'on', true);
    update public.messages set deleted_at = now(), body = '[removed]'
     where id = subject and reported_at is not null;
    perform set_config('app.internal', 'off', true);
  else
    raise exception 'Unknown kind.';
  end if;
end;
$$;

revoke execute on function public.mark_conversation_read(uuid) from public;
revoke execute on function public.report_message(uuid, text) from public;
revoke execute on function public.moderate_remove(text, uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.report_message(uuid, text) to authenticated;
grant execute on function public.moderate_remove(text, uuid) to authenticated;
