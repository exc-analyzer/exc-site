alter table public.reports
  add column if not exists hidden_at timestamptz;

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
  where r.hidden_at is null
    and public.scan_author_shown(
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
  left join public.profiles pr on pr.id = r.created_by
  where r.hidden_at is null;

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
        and r.hidden_at is null
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

drop view if exists public.explore;
create view public.explore
with (security_invoker = on) as
  select
    r.owner,
    r.repo,
    r.kind,
    r.score,
    r.scan_count,
    r.updated_at,
    (select h.score from public.report_scores h
      where h.report_id = r.id order by h.recorded_at asc limit 1) as first_score,
    r.score - (select h.score from public.report_scores h
      where h.report_id = r.id order by h.recorded_at asc limit 1) as improvement,
    (select count(*) from public.comments c
      where c.report_id = r.id and c.deleted_at is null) as replies,
    public.like_count('report', r.id) as likes
  from public.reports r
  where r.repo <> '' and r.hidden_at is null;

grant select on public.explore to anon, authenticated;

create or replace function public.moderate_remove(kind text, subject uuid, why text default null)
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
    perform set_config('exc.scoring', 'on', true);
    update public.comments
       set deleted_at = now(), body = '[removed]'
     where id = subject and deleted_at is null;
  elsif kind = 'post' then
    update public.posts
       set deleted_at = now(), body = '[removed]'
     where id = subject and deleted_at is null;
  elsif kind = 'report' then
    update public.reports
       set hidden_at = now()
     where id = subject and hidden_at is null;
  else
    raise exception 'Only a post, a comment or a scan can be taken down.';
  end if;

  if not found then
    raise exception 'It is already gone.';
  end if;

  update public.abuse_reports
     set status = 'reviewed'
   where target_type = kind and target_id = subject and status = 'open';
end;
$$;

grant execute on function public.moderate_remove(text, uuid, text) to authenticated;

select 'hidden_at column' as step,
       case when exists (select 1 from information_schema.columns
         where table_schema='public' and table_name='reports' and column_name='hidden_at')
         then 'ready' else 'MISSING' end as result
union all
select 'feed hides taken-down scans',
       case when exists (select 1 from pg_views where schemaname='public'
         and viewname='feed' and definition like '%hidden_at%')
         then 'ready' else 'MISSING' end
union all
select 'explore hides them too',
       case when exists (select 1 from pg_views where schemaname='public'
         and viewname='explore' and definition like '%hidden_at%')
         then 'ready' else 'MISSING' end;
