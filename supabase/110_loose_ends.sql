create or replace function public.i_scanned(report uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reports r
     where r.id = report
       and r.created_by = (select auth.uid())
  );
$$;

revoke execute on function public.i_scanned(uuid) from public, anon;
grant execute on function public.i_scanned(uuid) to authenticated;

create or replace view public.my_replies
with (security_invoker = on) as
 select c.id,
    c.body,
    c.created_at,
    c.author_id as from_id,
    a.gh_login as from_login,
    a.avatar_url as from_avatar,
    c.post_id,
    c.report_id,
    coalesce(
      po.author_id,
      case when re.id is not null and public.i_scanned(re.id)
           then (select auth.uid()) end,
      parent.author_id
    ) as to_id,
    case
      when c.parent_id is not null then 'comment'::text
      when c.post_id is not null then 'post'::text
      else 'report'::text
    end as on_what,
    re.owner as report_owner,
    re.repo as report_repo,
    re.kind as report_kind
   from public.comments c
     join public.profiles a on a.id = c.author_id
     left join public.posts po on po.id = c.post_id
     left join public.profiles poa on poa.id = po.author_id
     left join public.reports re on re.id = c.report_id
     left join public.comments parent on parent.id = c.parent_id
  where c.deleted_at is null
    and (po.id is null
      or po.deleted_at is not null
      or not poa.private_account
      or public.sees_private(poa.id)
      or c.author_id = (select auth.uid()));

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

  update public.abuse_reports
     set status = 'reviewed'
   where target_type = kind
     and target_id = subject
     and status = 'open';
end;
$$;

revoke execute on function public.moderation_queue() from public, anon;
grant execute on function public.moderation_queue() to authenticated;

create or replace function public.follow_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  if exists (
    select 1 from public.blocks b
     where (b.blocker_id = new.from_id and b.blocked_id = new.to_id)
        or (b.blocker_id = new.to_id and b.blocked_id = new.from_id)
  ) then
    raise exception 'There is a block between you two.';
  end if;

  select count(*) into recent
    from public.follow_requests r
   where r.from_id = new.from_id
     and r.created_at > now() - interval '1 hour';

  if recent >= 60 then
    raise exception 'That is a lot of follow requests in one hour. Try again a bit later.';
  end if;

  return new;
end;
$$;

drop trigger if exists follow_requests_guard_ins on public.follow_requests;
create trigger follow_requests_guard_ins
  before insert on public.follow_requests
  for each row execute function public.follow_requests_guard();

create index if not exists follow_requests_from_recent_idx
  on public.follow_requests (from_id, created_at);

create or replace function public.block_person(other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;
  if me = other then
    raise exception 'You cannot block yourself.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = other) then
    raise exception 'No such person.';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (me, other)
  on conflict do nothing;

  delete from public.people_follows
   where (follower_id = me and followee_id = other)
      or (follower_id = other and followee_id = me);

  delete from public.follow_requests
   where (from_id = me and to_id = other)
      or (from_id = other and to_id = me);
end;
$$;

drop function if exists public.reset_avatar(uuid);

select 'replies to you are readable again' as step,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'i_scanned')
       then 'ready' else 'MISSING' end as result
union all
select 'and that view still runs as the caller',
       case when 'security_invoker=on' = any(c.reloptions) then 'ready' else 'RLS BYPASSED' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'my_replies'
union all
select 'scan authorship is still not readable',
       case when not exists (select 1 from information_schema.column_privileges
                              where table_schema = 'public' and table_name = 'reports'
                                and column_name = 'created_by' and grantee in ('anon','authenticated'))
       then 'ready' else 'LEAKED' end
union all
select 'taking something down closes the filing',
       case when pg_get_functiondef(p.oid) like '%abuse_reports%' then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'moderate_remove'
union all
select 'the moderation inbox is no longer open to everyone',
       case when array_to_string(p.proacl, ' ') not like '%=X/postgres%' then 'ready' else 'STILL OPEN' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'moderation_queue'
union all
select 'a block now stops follow requests too',
       case when exists (select 1 from pg_trigger where tgrelid = 'public.follow_requests'::regclass
                          and tgname = 'follow_requests_guard_ins')
       then 'ready' else 'MISSING' end
union all
select 'blocking clears the requests already waiting',
       case when pg_get_functiondef(p.oid) like '%delete from public.follow_requests%' then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'block_person'
union all
select 'the broken avatar reset is gone',
       case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.proname = 'reset_avatar')
       then 'ready' else 'STILL THERE' end;
