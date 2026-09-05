alter table public.suppressed_owners
  add column if not exists added_by uuid references public.profiles (id) on delete set null;

create or replace function public.suppress_owner(login text, why text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  handle text := lower(trim(login));
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  if handle is null or handle = '' then
    raise exception 'Give the GitHub account name to leave out.';
  end if;

  if handle !~ '^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$' then
    raise exception 'That is not a GitHub account name.';
  end if;

  insert into public.suppressed_owners (gh_login, reason, added_by)
  values (handle, nullif(trim(why), ''), (select auth.uid()))
  on conflict (gh_login) do update
    set reason   = excluded.reason,
        added_by = excluded.added_by;

  delete from public.reports where lower(owner) = handle;
end;
$$;

create or replace function public.unsuppress_owner(login text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  delete from public.suppressed_owners where lower(gh_login) = lower(trim(login));
end;
$$;

create or replace function public.suppression_list()
returns table (
  gh_login   text,
  reason     text,
  created_at timestamptz,
  added_by   text
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
  select s.gh_login,
         s.reason,
         s.created_at,
         p.gh_login
    from public.suppressed_owners s
    left join public.profiles p on p.id = s.added_by
   order by s.created_at desc;
end;
$$;

grant execute on function public.unsuppress_owner(text) to authenticated;
grant execute on function public.suppression_list() to authenticated;

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
           case when re.id is not null
                then re.owner || case when re.repo <> '' then '/' || re.repo else '' end
                     || ' — ' || re.kind
           end
         ),
         coalesce(ca.gh_login, pa.gh_login, ra.gh_login),
         coalesce(c.deleted_at, po.deleted_at, re.hidden_at) is not null,
         re.owner
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

select 'suppress_owner no longer touches the catalogue' as step,
       case when pg_get_functiondef(p.oid) not like '%catalog_repos%'
            then 'fixed' else 'STILL BROKEN' end as result
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='suppress_owner'
union all
select 'taking an owner off the list',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='unsuppress_owner')
         then 'ready' else 'MISSING' end
union all
select 'reading the list',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='suppression_list')
         then 'ready' else 'MISSING' end
union all
select 'queue names the repository owner',
       case when pg_get_functiondef(p.oid) like '%subject_owner%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='moderation_queue';
