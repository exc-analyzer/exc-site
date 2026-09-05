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
    and (not pr.private_account or pr.id = (select auth.uid()))

  union all

  select
    'report'::text,
    r.id,
    case when public.scan_author_shown(
           r.author_visibility, pr.scans_public and not pr.private_account, r.created_by)
         then r.created_by end,
    case when public.scan_author_shown(
           r.author_visibility, pr.scans_public and not pr.private_account, r.created_by)
         then pr.gh_login end,
    case when public.scan_author_shown(
           r.author_visibility, pr.scans_public and not pr.private_account, r.created_by)
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
          r.author_visibility, pr.scans_public and not pr.private_account, r.created_by);

grant select on public.feed to anon, authenticated;

select 'hidden scans leave the feed' as step,
       case when exists (
         select 1 from pg_views
          where schemaname = 'public' and viewname = 'feed'
            and definition like '%scan_author_shown%'
       ) then 'ready' else 'MISSING' end as result;
