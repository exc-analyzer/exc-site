grant update (onboarded_at) on public.profiles to authenticated;

select 'settings can be saved again' as step,
       case when (select count(*) from information_schema.column_privileges
          where table_schema='public' and table_name='profiles'
            and grantee='authenticated' and privilege_type='UPDATE'
            and column_name in ('display_name','name_source','bio','accent',
                                'scans_public','banner_style','private_account',
                                'replies_public','onboarded_at')) = 9
       then 'ready' else 'STILL BROKEN' end as result
union all
select 'nothing server-owned slipped back in',
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='profiles'
            and grantee='authenticated' and privilege_type='UPDATE'
            and column_name in ('id','gh_login','gh_created_at','reputation',
                                'created_at','terms_accepted_at','tour_seen_at','avatar_url'))
       then 'closed' else 'STILL OPEN' end;
