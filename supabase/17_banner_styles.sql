alter table public.profiles
  add column if not exists banner_style text not null default 'glow';

alter table public.profiles
  drop constraint if exists profiles_accent_check;

alter table public.profiles
  add constraint profiles_accent_check
  check (accent in ('indigo', 'violet', 'fuchsia', 'pink', 'sky', 'cyan', 'teal', 'emerald', 'slate'));

alter table public.profiles
  drop constraint if exists profiles_banner_style_check;

alter table public.profiles
  add constraint profiles_banner_style_check
  check (banner_style in ('glow', 'mesh', 'beam', 'grid'));

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

select 'banner_style column' as step,
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles' and column_name = 'banner_style')
         then 'ready' else 'MISSING' end as result
union all
select 'nine accents allowed',
       case when exists (
         select 1 from information_schema.check_constraints
          where constraint_schema = 'public'
            and constraint_name = 'profiles_accent_check'
            and check_clause like '%teal%'
       ) then 'ready' else 'MISSING' end
union all
select 'member_profile carries banner',
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'member_profile'
           and column_name = 'banner_style')
         then 'ready' else 'MISSING' end;
