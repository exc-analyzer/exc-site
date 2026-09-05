drop function if exists public.moderation_queue();

create function public.moderation_queue()
returns table (
  id            uuid,
  created_at    timestamptz,
  target_type   text,
  target_id     uuid,
  reason        text,
  status        text,
  reported_by   text,
  body          text,
  author_login  text,
  gone          boolean,
  subject_owner text
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
         re.owner
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

grant execute on function public.moderation_queue() to authenticated;

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
    update public.messages set deleted_at = now(), body = '[removed]'
     where id = subject and reported_at is not null;
  else
    raise exception 'Unknown kind.';
  end if;
end;
$$;

select 'the queue can show a reported message' as step,
       case when pg_get_functiondef(p.oid) like '%reported_at is not null%'
            then 'ready' else 'MISSING' end as result
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='moderation_queue'
union all
select 'and only a reported one',
       case when pg_get_functiondef(p.oid) like '%ms.reported_at is not null%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='moderation_queue'
union all
select 'a moderator can take one down',
       case when pg_get_functiondef(p.oid) like '%public.messages set deleted_at%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='moderate_remove';
