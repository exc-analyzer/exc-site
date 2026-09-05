alter table public.profiles
  add column if not exists scans_public boolean not null default true;

drop view if exists public.feed;
create view public.feed
with (security_invoker = on) as
  select
    'post'::text        as kind,
    p.id                as id,
    p.author_id         as author_id,
    pr.gh_login         as author_login,
    pr.avatar_url       as author_avatar,
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

  union all

  select
    'report'::text,
    r.id,
    case when pr.id is null or pr.scans_public or pr.id = (select auth.uid())
         then r.created_by end,
    case when pr.id is null or pr.scans_public or pr.id = (select auth.uid())
         then pr.gh_login end,
    case when pr.id is null or pr.scans_public or pr.id = (select auth.uid())
         then pr.avatar_url end,
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
  left join public.profiles pr on pr.id = r.created_by;

grant select on public.feed to anon, authenticated;

drop view if exists public.member_profile;
create view public.member_profile
with (security_invoker = on) as
  select
    p.id,
    p.gh_login,
    p.avatar_url,
    p.accent,
    p.bio,
    p.created_at,
    p.scans_public,
    case when p.name_source = 'custom' and p.display_name is not null
         then p.display_name
         else coalesce(p.gh_name, p.gh_login)
    end as shown_name,
    (select count(*) from public.posts o
      where o.author_id = p.id and o.deleted_at is null) as post_count,
    case when p.scans_public or p.id = (select auth.uid())
         then (select count(*) from public.reports r where r.created_by = p.id)
         else 0
    end as scan_count,
    (select count(*) from public.comments c
      where c.author_id = p.id and c.deleted_at is null) as comment_count,
    (select count(*) from public.people_follows f where f.followee_id = p.id) as follower_count,
    (select count(*) from public.people_follows f where f.follower_id = p.id) as following_count
  from public.profiles p;

grant select on public.member_profile to anon, authenticated;

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
    case when pr.scans_public or pr.id = (select auth.uid()) then pr.gh_login end as scanner_login,
    case when pr.scans_public or pr.id = (select auth.uid()) then pr.avatar_url end as scanner_avatar
  from public.reports r
  left join public.profiles pr on pr.id = r.created_by;

grant select on public.report_card to anon, authenticated;

select 'scans_public column' as step,
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles' and column_name = 'scans_public')
         then 'ready' else 'MISSING' end as result
union all
select 'report_card view',
       case when exists (select 1 from information_schema.views
         where table_schema = 'public' and table_name = 'report_card')
         then 'ready' else 'MISSING' end
union all
select 'feed still readable',
       case when (select count(*) from public.feed) >= 0 then 'ready' else 'MISSING' end;
