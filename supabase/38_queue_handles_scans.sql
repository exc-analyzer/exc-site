create or replace function public.moderate_take_down(filing uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text;
  subject uuid;
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  select a.target_type, a.target_id into kind, subject
    from public.abuse_reports a where a.id = filing;

  if not found then
    raise exception 'No such filing.';
  end if;

  perform public.moderate_remove(kind, subject);
end;
$$;

grant execute on function public.moderate_take_down(uuid) to authenticated;

create or replace function public.moderation_queue()
returns table (
  id           uuid,
  created_at   timestamptz,
  target_type  text,
  target_id    uuid,
  reason       text,
  status       text,
  reported_by  text,
  body         text,
  author_login text,
  gone         boolean
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
           case when re.id is not null
                then re.owner || case when re.repo <> '' then '/' || re.repo else '' end
                     || ' — ' || re.kind
           end
         ),
         coalesce(ca.gh_login, pa.gh_login, ra.gh_login),
         coalesce(c.deleted_at, po.deleted_at, re.hidden_at) is not null
    from public.abuse_reports a
    join public.profiles rp on rp.id = a.reporter_id
    left join public.comments c on a.target_type = 'comment' and c.id = a.target_id
    left join public.profiles ca on ca.id = c.author_id
    left join public.posts po on a.target_type = 'post' and po.id = a.target_id
    left join public.profiles pa on pa.id = po.author_id
    left join public.reports re on a.target_type = 'report' and re.id = a.target_id
    left join public.profiles ra on ra.id = re.created_by
   order by (a.status = 'open') desc, a.created_at desc;
end;
$$;

grant execute on function public.moderation_queue() to authenticated;

select 'queue shows scans' as step,
       case when pg_get_functiondef(p.oid) like '%re.hidden_at%'
            then 'ready' else 'MISSING' end as result
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='moderation_queue';
