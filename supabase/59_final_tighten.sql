revoke select on public.report_scores from anon, authenticated;

drop policy if exists "comments are publicly readable" on public.comments;
create policy "comments follow the thing they hang on"
  on public.comments for select
  using (
    author_id = (select auth.uid())
    or (
      (report_id is null or exists (
        select 1 from public.reports r
         where r.id = comments.report_id and r.hidden_at is null
      ))
      and (post_id is null or exists (
        select 1 from public.posts p
         where p.id = comments.post_id and p.deleted_at is null
      ))
    )
  );

drop policy if exists "people follows are publicly readable" on public.people_follows;
create policy "a private account keeps its circle to itself"
  on public.people_follows for select
  using (
    follower_id = (select auth.uid())
    or followee_id = (select auth.uid())
    or (
      exists (select 1 from public.profiles p
               where p.id = people_follows.followee_id
                 and (not coalesce(p.private_account, false) or public.sees_private(p.id)))
      and exists (select 1 from public.profiles p
                   where p.id = people_follows.follower_id
                     and (not coalesce(p.private_account, false) or public.sees_private(p.id)))
    )
  );

create or replace function public.my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.profiles where id = (select auth.uid());
$$;

revoke execute on function public.my_profile() from public;
grant execute on function public.my_profile() to authenticated;

revoke select on public.profiles from anon, authenticated;

grant select (
  id, gh_login, avatar_url, gh_avatar_url, gh_name, display_name, name_source,
  bio, accent, banner_style, reputation, created_at, gh_created_at,
  private_account, scans_public
) on public.profiles to anon, authenticated;

select 'the dead score table is closed' as step,
       case when not exists (
         select 1 from information_schema.role_table_grants
          where table_schema='public' and table_name='report_scores'
            and grantee in ('anon','authenticated') and privilege_type='SELECT')
       then 'closed' else 'STILL OPEN' end as result
union all
select 'account state is no longer public',
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='profiles'
            and column_name in ('notifications_seen_at','terms_accepted_at','tour_seen_at','onboarded_at')
            and grantee in ('anon','authenticated') and privilege_type='SELECT')
       then 'closed' else 'STILL OPEN' end
union all
select 'a name is still readable',
       case when exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='profiles'
            and column_name='gh_login' and grantee='anon' and privilege_type='SELECT')
       then 'ready' else 'BROKEN' end
union all
select 'comments follow a takedown',
       case when (select qual::text from pg_policies
                   where schemaname='public' and tablename='comments' and cmd='SELECT')
                 like '%hidden_at%' then 'ready' else 'MISSING' end;
