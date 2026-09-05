create or replace function public.sees_private(owner uuid)
returns boolean
language sql
stable
as $$
  select owner = (select auth.uid())
      or exists (
           select 1 from public.people_follows f
            where f.followee_id = owner
              and f.follower_id = (select auth.uid())
         );
$$;

grant execute on function public.sees_private(uuid) to anon, authenticated;

drop view if exists public.feed;
create view public.feed
with (security_invoker = on) as
  select
    'post'::text        as kind,
    p.id                as id,
    p.author_id         as author_id,
    pr.gh_login         as author_login,
    pr.avatar_url       as author_avatar,
    null::text          as visibility,
    p.body              as body,
    p.repo_owner        as owner,
    p.repo_name         as repo,
    null::text          as report_kind,
    null::integer       as score,
    p.created_at        as happened_at,
    p.edited_at         as edited_at,
    p.quote_of          as quote_id,
    q.body              as quote_body,
    qa.gh_login         as quote_login,
    public.like_count('post', p.id) as likes,
    (select count(*) from public.comments c
      where c.post_id = p.id and c.deleted_at is null) as replies
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  left join public.posts q on q.id = p.quote_of and q.deleted_at is null
  left join public.profiles qa on qa.id = q.author_id
  where p.deleted_at is null
    and (not pr.private_account or public.sees_private(pr.id))

  union all

  select
    'report'::text,
    r.id,
    case when public.scan_author_shown(
           r.author_visibility, pr.scans_public and (not pr.private_account or public.sees_private(pr.id)), r.created_by)
         then r.created_by end,
    case when public.scan_author_shown(
           r.author_visibility, pr.scans_public and (not pr.private_account or public.sees_private(pr.id)), r.created_by)
         then pr.gh_login end,
    case when public.scan_author_shown(
           r.author_visibility, pr.scans_public and (not pr.private_account or public.sees_private(pr.id)), r.created_by)
         then pr.avatar_url end,
    r.author_visibility,
    null::text,
    r.owner,
    r.repo,
    r.kind,
    r.score,
    r.updated_at,
    null::timestamptz,
    null::uuid,
    null::text,
    null::text,
    public.like_count('report', r.id),
    (select count(*) from public.comments c
      where c.report_id = r.id and c.deleted_at is null)
  from public.reports r
  left join public.profiles pr on pr.id = r.created_by
  where public.scan_author_shown(
          r.author_visibility, pr.scans_public and (not pr.private_account or public.sees_private(pr.id)), r.created_by);

grant select on public.feed to anon, authenticated;

drop view if exists public.report_card;
create view public.report_card
with (security_invoker = on) as
  select
    r.id,
    r.owner,
    r.repo,
    r.kind,
    r.score,
    r.summary,
    r.scan_count,
    r.created_at,
    r.updated_at,
    r.author_visibility,
    case when public.scan_author_shown(
           r.author_visibility,
           pr.scans_public and (not pr.private_account or public.sees_private(pr.id)),
           r.created_by)
         then pr.gh_login end as scanner_login,
    case when public.scan_author_shown(
           r.author_visibility,
           pr.scans_public and (not pr.private_account or public.sees_private(pr.id)),
           r.created_by)
         then pr.avatar_url end as scanner_avatar
  from public.reports r
  left join public.profiles pr on pr.id = r.created_by;

grant select on public.report_card to anon, authenticated;

drop view if exists public.member_profile;
create view public.member_profile
with (security_invoker = on) as
  select
    p.id,
    p.gh_login,
    p.avatar_url,
    p.accent,
    p.banner_style,
    p.bio,
    p.created_at,
    p.scans_public,
    p.private_account,
    case when p.name_source = 'custom' and p.display_name is not null
         then p.display_name
         else coalesce(p.gh_name, p.gh_login)
    end as shown_name,
    case when p.private_account and not public.sees_private(p.id)
         then 0
         else (select count(*) from public.posts o
                where o.author_id = p.id and o.deleted_at is null)
    end as post_count,
    (select count(*) from public.reports r
      where r.created_by = p.id
        and public.scan_author_shown(
              r.author_visibility,
              p.scans_public and (not p.private_account or public.sees_private(p.id)),
              p.id)) as scan_count,
    (select count(*) from public.comments c
      where c.author_id = p.id and c.deleted_at is null) as comment_count,
    (select count(*) from public.people_follows f where f.followee_id = p.id) as follower_count,
    (select count(*) from public.people_follows f where f.follower_id = p.id) as following_count
  from public.profiles p;

grant select on public.member_profile to anon, authenticated;

drop view if exists public.my_replies;
create view public.my_replies
with (security_invoker = on) as
  select
    c.id,
    c.body,
    c.created_at,
    c.author_id            as from_id,
    a.gh_login             as from_login,
    a.avatar_url           as from_avatar,
    c.post_id,
    c.report_id,
    coalesce(po.author_id, re.created_by, parent.author_id) as to_id,
    case
      when c.parent_id is not null then 'comment'
      when c.post_id is not null then 'post'
      else 'report'
    end                    as on_what,
    re.owner               as report_owner,
    re.repo                as report_repo,
    re.kind                as report_kind
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

grant select on public.my_replies to authenticated;

select 'sees_private helper' as step,
       case when exists (select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'sees_private')
         then 'ready' else 'MISSING' end as result
union all
select 'feed honours followers',
       case when exists (select 1 from pg_views
         where schemaname = 'public' and viewname = 'feed'
           and definition like '%sees_private%')
         then 'ready' else 'MISSING' end
union all
select 'replies hide unreachable posts',
       case when exists (select 1 from pg_views
         where schemaname = 'public' and viewname = 'my_replies'
           and definition like '%sees_private%')
         then 'ready' else 'MISSING' end;
