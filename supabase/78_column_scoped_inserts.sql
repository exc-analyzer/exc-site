revoke insert on public.abuse_reports from anon, authenticated;
grant insert (target_type, target_id, reporter_id, reason)
  on public.abuse_reports to authenticated;

revoke insert on public.bookmarks from anon, authenticated;
grant insert (user_id, kind, target_id) on public.bookmarks to authenticated;

revoke insert on public.follow_requests from anon, authenticated;
grant insert (from_id, to_id) on public.follow_requests to authenticated;

revoke insert on public.people_follows from anon, authenticated;
grant insert (follower_id, followee_id) on public.people_follows to authenticated;

revoke insert on public.votes from anon, authenticated;
grant insert (user_id, target_type, target_id, value) on public.votes to authenticated;

revoke insert, update on public.follows from anon, authenticated;
grant insert (user_id, owner, repo) on public.follows to authenticated;
grant update (last_seen_at) on public.follows to authenticated;

revoke insert, update on public.pinned_repos from anon, authenticated;
grant insert (owner_id, owner, repo, note, position) on public.pinned_repos to authenticated;
grant update (note, position) on public.pinned_repos to authenticated;

revoke insert on public.feedback from anon, authenticated;
grant insert (author_id, kind, body) on public.feedback to authenticated;

select 'nothing can be backdated any more' as step,
       coalesce((
         select string_agg(distinct table_name, ', ')
           from information_schema.column_privileges
          where table_schema='public' and grantee in ('anon','authenticated')
            and privilege_type in ('INSERT','UPDATE') and column_name='created_at'
       ), 'none') as result
union all
select 'feedback and reports cannot arrive pre-settled',
       coalesce((
         select string_agg(table_name || '.' || column_name, ', ')
           from information_schema.column_privileges
          where table_schema='public' and grantee in ('anon','authenticated')
            and privilege_type='INSERT'
            and table_name in ('feedback','abuse_reports')
            and column_name in ('id','status','handled_at')
       ), 'none')
union all
select 'the app can still do all of its writes',
       case when (select count(*) from information_schema.column_privileges
          where table_schema='public' and grantee='authenticated' and privilege_type='INSERT'
            and ((table_name='votes' and column_name in ('user_id','target_type','target_id','value'))
              or (table_name='bookmarks' and column_name in ('user_id','kind','target_id'))
              or (table_name='follows' and column_name in ('user_id','owner','repo'))
              or (table_name='pinned_repos' and column_name in ('owner_id','owner','repo','note','position'))
              or (table_name='feedback' and column_name in ('author_id','kind','body'))
              or (table_name='people_follows' and column_name in ('follower_id','followee_id'))
              or (table_name='follow_requests' and column_name in ('from_id','to_id'))
              or (table_name='abuse_reports' and column_name in ('target_type','target_id','reporter_id','reason')))
          ) = 27
       then 'ready' else 'CHECK IT' end;
