create index if not exists messages_from_recent_idx
  on public.messages (from_id, created_at);

CREATE OR REPLACE FUNCTION public.messages_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  recent integer;
  burst integer;
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

    select count(*),
           count(*) filter (where m.created_at > now() - interval '10 seconds')
      into recent, burst
      from public.messages m
     where m.from_id = new.from_id
       and m.created_at > now() - interval '1 hour';

    if burst >= 30 then
      raise exception 'You are sending those faster than anyone can read them. Wait a few seconds and carry on.';
    end if;

    if recent >= 600 then
      raise exception 'That is a lot of messages in one hour. Take a break and pick this back up a bit later.';
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

CREATE OR REPLACE FUNCTION public.posts_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  account_created timestamptz;
  github_created  timestamptz;
  recent integer;
begin
  if tg_op = 'INSERT' then
    select p.created_at, p.gh_created_at
      into account_created, github_created
      from public.profiles p
     where p.id = new.author_id;

    if account_created is null then
      raise exception 'This account cannot post yet.';
    end if;

    if github_created is null or github_created > now() - interval '30 days' then
      if account_created > now() - interval '24 hours' then
        raise exception 'Your GitHub account is new, so posting opens 24 hours after you sign in here.';
      end if;
    end if;

    select count(*) into recent
    from public.posts
    where author_id = new.author_id
      and created_at > now() - interval '1 hour';

    if recent >= 40 then
      raise exception 'That is a lot of posts in one hour. Take a break and pick this back up a bit later.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.author_id  := old.author_id;
    new.created_at := old.created_at;

    if new.body is distinct from old.body
       and old.deleted_at is null
       and new.deleted_at is null
       and old.created_at < now() - interval '5 minutes' then
      raise exception 'A post can be edited for 5 minutes. After that it stands as written.';
    end if;

    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

select 'a lively hour is no longer punished' as step,
       case when pg_get_functiondef(p.oid) like '%recent >= 600%'
       then 'ready' else 'MISSING' end as result
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'messages_guard'
union all
select 'a script is still stopped in seconds',
       case when pg_get_functiondef(p.oid) like '%burst >= 30%'
       then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'messages_guard'
union all
select 'taking a message back does not refund quota',
       case when pg_get_functiondef(p.oid) not like '%deleted_at is null%'
       then 'ready' else 'BYPASS' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'messages_guard'
union all
select 'the counting query has an index to stand on',
       case when exists (select 1 from pg_indexes
                          where schemaname = 'public'
                            and tablename = 'messages'
                            and indexdef like '%(from_id, created_at)%')
       then 'ready' else 'MISSING' end
union all
select 'posting has room to breathe',
       case when pg_get_functiondef(p.oid) like '%recent >= 40%'
       then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'posts_guard';
