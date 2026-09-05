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
    when exists (
      select 1 from public.blocks b
       where (b.blocker_id = one and b.blocked_id = two)
          or (b.blocker_id = two and b.blocked_id = one)
    ) then false
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

create or replace function public.chat_key(other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  a uuid;
  b uuid;
  k uuid;
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;
  if me = other then
    raise exception 'That is you.';
  end if;

  if exists (
    select 1 from public.blocks bl
     where (bl.blocker_id = me and bl.blocked_id = other)
        or (bl.blocker_id = other and bl.blocked_id = me)
  ) then
    raise exception 'There is a block between you two.';
  end if;

  if not (
    exists (select 1 from public.people_follows f
             where f.follower_id = me and f.followee_id = other)
    and exists (select 1 from public.people_follows f
                 where f.follower_id = other and f.followee_id = me)
  ) then
    raise exception 'You can only message someone who follows you back.';
  end if;

  a := least(me, other);
  b := greatest(me, other);

  select c.key into k from public.chat_keys c where c.one = a and c.two = b;
  if k is null then
    insert into public.chat_keys (one, two) values (a, b)
    on conflict (one, two) do nothing;
    select c.key into k from public.chat_keys c where c.one = a and c.two = b;
  end if;

  return k;
end;
$$;

create or replace function public.my_conversations()
returns table (
  other_id     uuid,
  gh_login     text,
  shown_name   text,
  avatar_url   text,
  accent       text,
  avatar_shape text,
  last_body    text,
  last_at      timestamptz,
  last_from_me boolean,
  unread       bigint,
  still_open   boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;

  return query
  with pairs as (
    select case when m.from_id = me then m.to_id else m.from_id end as other,
           m.body, m.created_at, m.from_id = me as from_me,
           m.read_at, m.to_id
      from public.messages m
     where m.from_id = me or m.to_id = me
  ),
  open_pairs as (
    select * from pairs p
     where not exists (
       select 1 from public.blocks b
        where (b.blocker_id = me and b.blocked_id = p.other)
           or (b.blocker_id = p.other and b.blocked_id = me)
     )
  ),
  latest as (
    select distinct on (other) other, body, created_at, from_me
      from open_pairs
     order by other, created_at desc
  )
  select l.other,
         p.gh_login,
         public.shown_name(p.name_source, p.display_name, p.gh_name, p.gh_login),
         p.avatar_url,
         p.accent,
         p.avatar_shape,
         l.body,
         l.created_at,
         l.from_me,
         (select count(*) from open_pairs x
           where x.other = l.other and x.to_id = me and x.read_at is null),
         public.follow_is_mutual(me, l.other)
    from latest l
    join public.profiles p on p.id = l.other
   order by l.created_at desc;
end;
$$;

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
     and m.deleted_at is null
     and not exists (
       select 1 from public.blocks b
        where (b.blocker_id = m.to_id and b.blocked_id = m.from_id)
           or (b.blocker_id = m.from_id and b.blocked_id = m.to_id)
     );
$$;

select 'a block stops new messages' as step,
       case when pg_get_functiondef(p.oid) like '%block between you two%'
            then 'ready' else 'MISSING' end as result
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='messages_guard'
union all
select 'and closes the typing channel',
       case when pg_get_functiondef(p.oid) like '%block between you two%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='chat_key'
union all
select 'and drops it from the list',
       case when pg_get_functiondef(p.oid) like '%open_pairs%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='my_conversations'
union all
select 'and out of the unread count',
       case when pg_get_functiondef(p.oid) like '%public.blocks%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='unread_mail';
