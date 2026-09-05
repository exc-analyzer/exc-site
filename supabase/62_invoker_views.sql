create or replace function public.scanner_of(report uuid)
returns table (shown boolean, who uuid, login text, name text, avatar text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.scan_author_shown(
      r.author_visibility,
      p.scans_public and (not p.private_account or public.sees_private(p.id)),
      r.created_by
    ) as shown,
    case when public.scan_author_shown(
      r.author_visibility,
      p.scans_public and (not p.private_account or public.sees_private(p.id)),
      r.created_by) then r.created_by end,
    case when public.scan_author_shown(
      r.author_visibility,
      p.scans_public and (not p.private_account or public.sees_private(p.id)),
      r.created_by) then p.gh_login end,
    case when public.scan_author_shown(
      r.author_visibility,
      p.scans_public and (not p.private_account or public.sees_private(p.id)),
      r.created_by)
      then public.shown_name(p.name_source, p.display_name, p.gh_name, p.gh_login) end,
    case when public.scan_author_shown(
      r.author_visibility,
      p.scans_public and (not p.private_account or public.sees_private(p.id)),
      r.created_by) then p.avatar_url end
  from public.reports r
  left join public.profiles p on p.id = r.created_by
  where r.id = report;
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
    (select count(*) from public.comments c
      where c.author_id = p.id and c.deleted_at is null),
    (select count(*) from public.people_follows f where f.followee_id = p.id),
    (select count(*) from public.people_follows f where f.follower_id = p.id)
  from public.profiles p
  where p.id = member;
$$;

revoke execute on function public.scanner_of(uuid) from public;
revoke execute on function public.member_tally(uuid) from public;
grant execute on function public.scanner_of(uuid) to anon, authenticated;
grant execute on function public.member_tally(uuid) to anon, authenticated;

grant select (
  id, owner, repo, kind, score, summary, scan_count,
  created_at, updated_at, author_visibility, hidden_at, disputed_at, disputed_note
) on public.reports to anon;

grant select on public.posts to anon;

select 'the masking helpers exist' as step,
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname in ('scanner_of','member_tally')) = 2
       then 'ready' else 'MISSING' end as result
union all
select 'the scanner identity column is still closed',
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='reports'
            and column_name='created_by' and grantee in ('anon','authenticated')
            and privilege_type='SELECT')
       then 'closed' else 'STILL OPEN' end;
