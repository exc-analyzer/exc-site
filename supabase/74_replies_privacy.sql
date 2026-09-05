alter table public.profiles
  add column if not exists replies_public boolean not null default true;

grant update (replies_public) on public.profiles to authenticated;
grant select (replies_public) on public.profiles to anon, authenticated;

create or replace function public.member_replies(member uuid, lim integer default 25)
returns table (
  id           uuid,
  body         text,
  created_at   timestamptz,
  on_what      text,
  post_id      uuid,
  report_id    uuid,
  report_owner text,
  report_repo  text,
  report_kind  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
         c.body,
         c.created_at,
         case
           when c.parent_id is not null then 'comment'
           when c.post_id is not null then 'post'
           else 'report'
         end,
         c.post_id,
         c.report_id,
         re.owner,
         re.repo,
         re.kind
    from public.comments c
    left join public.reports re on re.id = c.report_id
   where c.author_id = member
     and c.deleted_at is null
     and public.thread_is_open(c.report_id, c.post_id)
     and (
       c.author_id = (select auth.uid())
       or exists (
         select 1 from public.profiles p
          where p.id = member
            and coalesce(p.replies_public, true)
            and (not coalesce(p.private_account, false) or public.sees_private(p.id))
       )
     )
   order by c.created_at desc
   limit greatest(1, least(lim, 100));
$$;

create or replace function public.member_tally(member uuid)
returns table (posts bigint, scans bigint, comments bigint, followers bigint, following bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when p.private_account and not public.sees_private(p.id) then 0::bigint
         else (select count(*) from public.posts o
                where o.author_id = p.id and o.deleted_at is null) end,
    (select count(*) from public.reports r
      where r.created_by = p.id and r.hidden_at is null
        and public.scan_author_shown(r.author_visibility,
              p.scans_public and (not p.private_account or public.sees_private(p.id)), p.id)),
    case
      when p.id = (select auth.uid()) then
        (select count(*) from public.comments c
          where c.author_id = p.id and c.deleted_at is null
            and public.thread_is_open(c.report_id, c.post_id))
      when not coalesce(p.replies_public, true) then 0::bigint
      when p.private_account and not public.sees_private(p.id) then 0::bigint
      else (select count(*) from public.comments c
             where c.author_id = p.id and c.deleted_at is null
               and public.thread_is_open(c.report_id, c.post_id))
    end,
    (select count(*) from public.people_follows f where f.followee_id = p.id),
    (select count(*) from public.people_follows f where f.follower_id = p.id)
  from public.profiles p
  where p.id = member;
$$;

select 'the switch exists' as step,
       case when exists (select 1 from information_schema.columns
         where table_schema='public' and table_name='profiles' and column_name='replies_public')
       then 'ready' else 'MISSING' end as result
union all
select 'a person can flip it',
       case when exists (select 1 from information_schema.column_privileges
         where table_schema='public' and table_name='profiles' and column_name='replies_public'
           and grantee='authenticated' and privilege_type='UPDATE')
       then 'ready' else 'MISSING' end
union all
select 'the list respects it',
       case when pg_get_functiondef(p.oid) like '%replies_public%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='member_replies'
union all
select 'and so does the counter',
       case when pg_get_functiondef(p.oid) like '%replies_public%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='member_tally';
