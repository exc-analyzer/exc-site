drop view if exists public.member_profile;

create view public.member_profile
with (security_invoker = on) as
  select p.id, p.gh_login, p.avatar_url, p.accent, p.banner_style, p.bio,
         p.created_at, p.scans_public, p.private_account,
         public.shown_name(p.name_source, p.display_name, p.gh_name, p.gh_login) as shown_name,
         coalesce(p.replies_public, true) as replies_public,
         p.banner_height,
         p.gradient_angle,
         p.accent_two,
         p.avatar_shape,
         p.avatar_ring,
         p.status,
         t.posts     as post_count,
         t.scans     as scan_count,
         t.comments  as comment_count,
         t.followers as follower_count,
         t.following as following_count
    from public.profiles p
    cross join lateral public.member_tally(p.id) t;

grant select on public.member_profile to anon, authenticated;
revoke truncate, references, trigger on public.member_profile from anon, authenticated;

select 'the public page can read the new looks' as step,
       case when (select count(*) from information_schema.columns
         where table_schema='public' and table_name='member_profile'
           and column_name in ('banner_height','gradient_angle','accent_two',
                               'avatar_shape','avatar_ring','status')) = 6
       then 'ready' else 'MISSING' end as result
union all
select 'still an invoker view',
       case when exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relname='member_profile'
           and 'security_invoker=on' = any(c.reloptions))
       then 'ready' else 'MISSING' end;
