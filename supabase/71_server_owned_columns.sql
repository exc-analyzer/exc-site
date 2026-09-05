revoke insert on public.reports from authenticated;
grant insert (owner, repo, kind, score, summary, created_by)
  on public.reports to authenticated;

revoke insert, update on public.posts from authenticated;
grant insert (author_id, body, repo_owner, repo_name, quote_of)
  on public.posts to authenticated;
grant update (body, repo_owner, repo_name, deleted_at)
  on public.posts to authenticated;

revoke update on public.comments from authenticated;
grant update (body, deleted_at) on public.comments to authenticated;

revoke insert on public.comments from authenticated;
grant insert (author_id, body, report_id, post_id, parent_id)
  on public.comments to authenticated;

revoke insert, update on public.profiles from authenticated;
grant insert (id, gh_login, gh_name, gh_avatar_url, avatar_url)
  on public.profiles to authenticated;
grant update (
  bio, accent, banner_style, display_name, name_source,
  scans_public, private_account, gh_name, gh_avatar_url,
  notifications_seen_at
) on public.profiles to authenticated;

select 'a report cannot arrive pre-flagged or pre-counted' as step,
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='reports'
            and column_name in ('hidden_at','disputed_at','scan_count','created_at','id')
            and grantee='authenticated' and privilege_type='INSERT')
       then 'closed' else 'STILL OPEN' end as result
union all
select 'a post cannot be backdated',
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='posts'
            and column_name in ('created_at','edited_at','id')
            and grantee='authenticated' and privilege_type='INSERT')
       then 'closed' else 'STILL OPEN' end
union all
select 'account age can no longer be self-reported',
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='profiles'
            and column_name in ('gh_created_at','reputation','terms_accepted_at','tour_seen_at')
            and grantee='authenticated' and privilege_type in ('INSERT','UPDATE'))
       then 'closed' else 'STILL OPEN' end
union all
select 'people can still post, comment and edit their profile',
       case when (select count(*) from information_schema.column_privileges
          where table_schema='public'
            and ((table_name='posts' and column_name='body' and privilege_type='INSERT')
              or (table_name='comments' and column_name='body' and privilege_type='UPDATE')
              or (table_name='profiles' and column_name='bio' and privilege_type='UPDATE'))
            and grantee='authenticated') = 3
       then 'ready' else 'BROKEN' end;
