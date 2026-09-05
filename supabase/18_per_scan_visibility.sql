alter table public.reports
  add column if not exists author_visibility text not null default 'default';

alter table public.reports
  drop constraint if exists reports_author_visibility_check;

alter table public.reports
  add constraint reports_author_visibility_check
  check (author_visibility in ('default', 'public', 'private'));

create or replace function public.scan_author_shown(vis text, is_public boolean, author uuid)
returns boolean
language sql
stable
as $$
  select case
    when author is null then true
    when author = (select auth.uid()) then true
    when vis = 'public' then true
    when vis = 'private' then false
    else coalesce(is_public, true)
  end;
$$;

grant execute on function public.scan_author_shown(text, boolean, uuid) to anon, authenticated;

create or replace function public.reports_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
  same_result boolean;
begin
  if tg_op = 'UPDATE' then
    same_result := new.summary is not distinct from old.summary
               and new.score is not distinct from old.score;

    if same_result and new.created_by is distinct from old.created_by then
      raise exception 'A report changes hands only when it is scanned again.';
    end if;

    if same_result then
      new.scan_count := old.scan_count;
      new.created_at := old.created_at;
      new.updated_at := old.updated_at;
      return new;
    end if;
  end if;

  select count(*) into recent
  from public.reports
  where created_by = (select auth.uid())
    and updated_at > now() - interval '1 hour';

  if recent >= 120 then
    raise exception 'Hourly report limit reached. Try again a little later.';
  end if;

  if tg_op = 'UPDATE' then
    new.scan_count := old.scan_count + 1;
    new.created_at := old.created_at;
    new.author_visibility := case
      when new.created_by is distinct from old.created_by then 'default'
      else old.author_visibility
    end;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

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

  union all

  select
    'report'::text,
    r.id,
    case when public.scan_author_shown(r.author_visibility, pr.scans_public, r.created_by)
         then r.created_by end,
    case when public.scan_author_shown(r.author_visibility, pr.scans_public, r.created_by)
         then pr.gh_login end,
    case when public.scan_author_shown(r.author_visibility, pr.scans_public, r.created_by)
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
  left join public.profiles pr on pr.id = r.created_by;

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
    case when public.scan_author_shown(r.author_visibility, pr.scans_public, r.created_by)
         then pr.gh_login end as scanner_login,
    case when public.scan_author_shown(r.author_visibility, pr.scans_public, r.created_by)
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
    case when p.name_source = 'custom' and p.display_name is not null
         then p.display_name
         else coalesce(p.gh_name, p.gh_login)
    end as shown_name,
    (select count(*) from public.posts o
      where o.author_id = p.id and o.deleted_at is null) as post_count,
    (select count(*) from public.reports r
      where r.created_by = p.id
        and public.scan_author_shown(r.author_visibility, p.scans_public, p.id)) as scan_count,
    (select count(*) from public.comments c
      where c.author_id = p.id and c.deleted_at is null) as comment_count,
    (select count(*) from public.people_follows f where f.followee_id = p.id) as follower_count,
    (select count(*) from public.people_follows f where f.follower_id = p.id) as following_count
  from public.profiles p;

grant select on public.member_profile to anon, authenticated;

select 'author_visibility column' as step,
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'reports'
           and column_name = 'author_visibility')
         then 'ready' else 'MISSING' end as result
union all
select 'feed carries visibility',
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'feed' and column_name = 'visibility')
         then 'ready' else 'MISSING' end
union all
select 'helper function',
       case when exists (select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'scan_author_shown')
         then 'ready' else 'MISSING' end;
