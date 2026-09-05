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
  latest as (
    select distinct on (other) other, body, created_at, from_me
      from pairs
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
         (select count(*) from pairs x
           where x.other = l.other and x.to_id = me and x.read_at is null),
         public.follow_is_mutual(me, l.other)
    from latest l
    join public.profiles p on p.id = l.other
   order by l.created_at desc;
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

  update public.messages
     set read_at = now()
   where to_id = (select auth.uid())
     and from_id = other
     and read_at is null;
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

  update public.messages set reported_at = now() where id = message;

  insert into public.abuse_reports (target_type, target_id, reporter_id, reason)
  values ('message', message, me, btrim(why));
end;
$$;

revoke execute on function public.my_conversations() from public;
revoke execute on function public.mark_conversation_read(uuid) from public;
revoke execute on function public.report_message(uuid, text) from public;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.report_message(uuid, text) to authenticated;

alter table public.abuse_reports drop constraint if exists abuse_reports_target_type_check;
alter table public.abuse_reports add constraint abuse_reports_target_type_check
  check (target_type in ('comment', 'post', 'profile', 'report', 'message'));

select 'the conversation list' as step,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='my_conversations')
       then 'ready' else 'MISSING' end as result
union all
select 'marking a thread read',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='mark_conversation_read')
       then 'ready' else 'MISSING' end
union all
select 'reporting a message you received',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='report_message')
       then 'ready' else 'MISSING' end
union all
select 'a message can now be flagged',
       case when pg_get_constraintdef(oid) like '%message%'
            then 'ready' else 'MISSING' end
  from pg_constraint
 where conrelid='public.abuse_reports'::regclass
   and conname='abuse_reports_target_type_check';
