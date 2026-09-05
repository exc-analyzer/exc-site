create or replace function public.follow_is_mutual(one uuid, two uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then false
    when (select auth.uid()) <> one and (select auth.uid()) <> two then false
    else exists (select 1 from public.people_follows f
                  where f.follower_id = one and f.followee_id = two)
     and exists (select 1 from public.people_follows f
                  where f.follower_id = two and f.followee_id = one)
  end;
$$;

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
    new.from_id     := old.from_id;
    new.to_id       := old.to_id;
    new.created_at  := old.created_at;
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

revoke select on public.messages from authenticated;
grant select (id, from_id, to_id, body, created_at, read_at, deleted_at)
  on public.messages to authenticated;
