create table if not exists public.removed_content (
  kind text not null,
  subject uuid not null,
  body text,
  removed_at timestamptz not null default now(),
  primary key (kind, subject)
);

alter table public.removed_content enable row level security;
revoke all on public.removed_content from anon, authenticated;

create or replace function public.moderate_remove(kind text, subject uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  kept text;
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  if kind = 'comment' then
    select c.body into kept from public.comments c where c.id = subject;
    update public.comments set deleted_at = now(), body = '[removed]' where id = subject;
  elsif kind = 'post' then
    select p.body into kept from public.posts p where p.id = subject;
    update public.posts set deleted_at = now(), body = '[removed]' where id = subject;
  elsif kind = 'report' then
    update public.reports set hidden_at = now() where id = subject;
  elsif kind = 'message' then
    select m.body into kept from public.messages m where m.id = subject;
    perform set_config('app.internal', 'on', true);
    update public.messages set deleted_at = now(), body = '[removed]'
     where id = subject and reported_at is not null;
    perform set_config('app.internal', 'off', true);
  else
    raise exception 'Unknown kind.';
  end if;

  if kept is not null and kept <> '[removed]' then
    delete from public.removed_content rc
     where rc.kind = moderate_remove.kind
       and rc.subject = moderate_remove.subject;

    insert into public.removed_content (kind, subject, body)
    values (moderate_remove.kind, moderate_remove.subject, kept);
  end if;

  update public.abuse_reports
     set status = 'reviewed'
   where target_type = kind
     and target_id = subject
     and status = 'open';
end;
$$;

create or replace function public.moderate_restore(kind text, subject uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  kept text;
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  select r.body into kept from public.removed_content r
   where r.kind = moderate_restore.kind and r.subject = moderate_restore.subject;

  if kind = 'post' then
    update public.posts
       set deleted_at = null, body = coalesce(kept, body)
     where id = subject;
  elsif kind = 'comment' then
    update public.comments
       set deleted_at = null, body = coalesce(kept, body)
     where id = subject;
  elsif kind = 'report' then
    update public.reports set hidden_at = null where id = subject;
  elsif kind = 'message' then
    perform set_config('app.internal', 'on', true);
    update public.messages
       set deleted_at = null, body = coalesce(kept, body)
     where id = subject;
    perform set_config('app.internal', 'off', true);
  else
    raise exception 'Unknown kind.';
  end if;

  delete from public.removed_content r
   where r.kind = moderate_restore.kind and r.subject = moderate_restore.subject;
end;
$$;

revoke execute on function public.moderate_restore(text, uuid) from public, anon;
grant execute on function public.moderate_restore(text, uuid) to authenticated;

drop function if exists public.moderation_queue();

create function public.moderation_queue()
returns table(
  id uuid,
  created_at timestamp with time zone,
  target_type text,
  target_id uuid,
  reason text,
  status text,
  reported_by text,
  body text,
  author_login text,
  gone boolean,
  subject_owner text,
  disputed boolean,
  recoverable boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  return query
  select a.id,
         a.created_at,
         a.target_type,
         a.target_id,
         a.reason,
         a.status,
         rp.gh_login,
         coalesce(
           c.body,
           po.body,
           ms.body,
           case when re.id is not null
                then re.owner || case when re.repo <> '' then '/' || re.repo else '' end
                     || ' — ' || re.kind
           end
         ),
         coalesce(ca.gh_login, pa.gh_login, ra.gh_login, ma.gh_login),
         coalesce(c.deleted_at, po.deleted_at, ms.deleted_at, re.hidden_at) is not null,
         re.owner,
         re.disputed_at is not null,
         exists (
           select 1 from public.removed_content rc
            where rc.kind = a.target_type and rc.subject = a.target_id
         ) or (a.target_type = 'report' and re.hidden_at is not null)
    from public.abuse_reports a
    join public.profiles rp on rp.id = a.reporter_id
    left join public.comments c on a.target_type = 'comment' and c.id = a.target_id
    left join public.profiles ca on ca.id = c.author_id
    left join public.posts po on a.target_type = 'post' and po.id = a.target_id
    left join public.profiles pa on pa.id = po.author_id
    left join public.reports re on a.target_type = 'report' and re.id = a.target_id
    left join public.profiles ra on ra.id = re.created_by
    left join public.messages ms
      on a.target_type = 'message' and ms.id = a.target_id and ms.reported_at is not null
    left join public.profiles ma on ma.id = ms.from_id
   order by (a.status = 'open') desc, a.created_at desc;
end;
$$;

revoke execute on function public.moderation_queue() from public, anon;
grant execute on function public.moderation_queue() to authenticated;

select 'what was taken down is kept somewhere' as step,
       case when to_regclass('public.removed_content') is not null then 'ready' else 'MISSING' end as result
union all
select 'and nobody but the server can read it',
       case when not exists (select 1 from information_schema.table_privileges
                              where table_schema='public' and table_name='removed_content'
                                and grantee in ('anon','authenticated'))
       then 'ready' else 'READABLE' end
union all
select 'removing keeps a copy first',
       case when pg_get_functiondef(p.oid) like '%removed_content%' then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='moderate_remove'
union all
select 'putting it back brings the words back',
       case when pg_get_functiondef(p.oid) like '%coalesce(kept, body)%' then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='moderate_restore'
union all
select 'a taken-back message can be put back too',
       case when pg_get_functiondef(p.oid) like '%messages%' then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='moderate_restore'
union all
select 'the queue says what is disputed and what can be undone',
       case when pg_get_function_result(p.oid) like '%disputed boolean%'
             and pg_get_function_result(p.oid) like '%recoverable boolean%'
       then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='moderation_queue';
