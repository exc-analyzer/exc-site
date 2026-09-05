drop view if exists public.feed;
drop view if exists public.report_card;
drop view if exists public.member_profile;
drop function if exists public.scanner_of(uuid);

create function public.scanner_of(report uuid)
returns table (
  shown boolean, who uuid, login text, name text, avatar text,
  accent text, accent_two text, shape text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.scan_author_shown(r.author_visibility,
      p.scans_public and (not p.private_account or public.sees_private(p.id)), r.created_by),
    case when public.scan_author_shown(r.author_visibility,
      p.scans_public and (not p.private_account or public.sees_private(p.id)), r.created_by)
      then r.created_by end,
    case when public.scan_author_shown(r.author_visibility,
      p.scans_public and (not p.private_account or public.sees_private(p.id)), r.created_by)
      then p.gh_login end,
    case when public.scan_author_shown(r.author_visibility,
      p.scans_public and (not p.private_account or public.sees_private(p.id)), r.created_by)
      then public.shown_name(p.name_source, p.display_name, p.gh_name, p.gh_login) end,
    case when public.scan_author_shown(r.author_visibility,
      p.scans_public and (not p.private_account or public.sees_private(p.id)), r.created_by)
      then p.avatar_url end,
    case when public.scan_author_shown(r.author_visibility,
      p.scans_public and (not p.private_account or public.sees_private(p.id)), r.created_by)
      then p.accent end,
    case when public.scan_author_shown(r.author_visibility,
      p.scans_public and (not p.private_account or public.sees_private(p.id)), r.created_by)
      then p.accent_two end,
    case when public.scan_author_shown(r.author_visibility,
      p.scans_public and (not p.private_account or public.sees_private(p.id)), r.created_by)
      then p.avatar_shape end
  from public.reports r
  left join public.profiles p on p.id = r.created_by
  where r.id = report;
$$;

revoke execute on function public.scanner_of(uuid) from public;
grant execute on function public.scanner_of(uuid) to anon, authenticated;

create view public.feed
with (security_invoker = on) as
  select 'post'::text as kind, p.id, p.author_id,
         pr.gh_login as author_login,
         public.shown_name(pr.name_source, pr.display_name, pr.gh_name, pr.gh_login) as author_name,
         pr.avatar_url as author_avatar,
         pr.accent as author_accent,
         pr.accent_two as author_accent_two,
         pr.avatar_shape as author_shape,
         null::text as visibility,
         p.body, p.repo_owner as owner, p.repo_name as repo,
         null::text as report_kind, null::integer as score,
         p.created_at as happened_at, p.edited_at,
         p.quote_of as quote_id, q.body as quote_body, qa.gh_login as quote_login,
         public.like_count('post', p.id) as likes,
         (select count(*) from public.comments c
           where c.post_id = p.id and c.deleted_at is null) as replies
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
    left join public.posts q on q.id = p.quote_of and q.deleted_at is null
    left join public.profiles qa on qa.id = q.author_id
   where p.deleted_at is null
  union all
  select 'report'::text, r.id, s.who, s.login, s.name, s.avatar,
         s.accent, s.accent_two, s.shape,
         r.author_visibility, null::text, r.owner, r.repo, r.kind, r.score,
         r.updated_at, null::timestamptz, null::uuid, null::text, null::text,
         public.like_count('report', r.id),
         (select count(*) from public.comments c
           where c.report_id = r.id and c.deleted_at is null)
    from public.reports r
    cross join lateral public.scanner_of(r.id) s
   where r.hidden_at is null and s.shown;

create view public.report_card
with (security_invoker = on) as
  select r.id, r.owner, r.repo, r.kind, r.score, r.summary, r.scan_count,
         r.created_at, r.updated_at, r.author_visibility,
         r.disputed_at, r.disputed_note,
         s.login as scanner_login, s.avatar as scanner_avatar
    from public.reports r
    cross join lateral public.scanner_of(r.id) s
   where r.hidden_at is null;

create view public.member_profile
with (security_invoker = on) as
  select p.id, p.gh_login, p.avatar_url, p.accent, p.banner_style, p.bio,
         p.created_at, p.scans_public, p.private_account,
         public.shown_name(p.name_source, p.display_name, p.gh_name, p.gh_login) as shown_name,
         coalesce(p.replies_public, true) as replies_public,
         p.banner_height, p.gradient_angle, p.accent_two, p.avatar_shape, p.status,
         t.posts as post_count, t.scans as scan_count, t.comments as comment_count,
         t.followers as follower_count, t.following as following_count
    from public.profiles p
    cross join lateral public.member_tally(p.id) t;

grant select on public.feed, public.report_card, public.member_profile to anon, authenticated;
revoke truncate, references, trigger on public.feed, public.report_card, public.member_profile
  from anon, authenticated;

alter table public.profiles drop constraint if exists profiles_avatar_ring_check;
alter table public.profiles drop column if exists avatar_ring;

select 'the ring setting is gone' as step,
       case when not exists (select 1 from information_schema.columns
         where table_schema='public' and table_name='profiles' and column_name='avatar_ring')
       then 'clean' else 'STILL THERE' end as result
union all
select 'shape and colours still travel',
       case when (select count(*) from information_schema.columns
         where table_schema='public' and table_name='feed'
           and column_name in ('author_accent','author_accent_two','author_shape')) = 3
       then 'ready' else 'MISSING' end
union all
select 'every view is still invoker',
       coalesce((select string_agg(c.relname, ', ') from pg_class c
                  join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public' and c.relkind='v'
                   and not ('security_invoker=on' = any(coalesce(c.reloptions,'{}')))), 'all invoker');
