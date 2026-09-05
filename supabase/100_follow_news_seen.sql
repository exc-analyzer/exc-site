alter table public.follow_news
  add column if not exists seen_at timestamptz;

create or replace function public.mark_follow_news_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.follow_news
     set seen_at = now()
   where user_id = (select auth.uid())
     and seen_at is null;
$$;

revoke execute on function public.mark_follow_news_seen() from public, anon;
grant execute on function public.mark_follow_news_seen() to authenticated;

drop function if exists public.my_follow_news();

create function public.my_follow_news()
returns table (
  id           uuid,
  other_id     uuid,
  gh_login     text,
  shown_name   text,
  avatar_url   text,
  accent       text,
  avatar_shape text,
  kind         text,
  at           timestamptz,
  seen         boolean,
  mutual       boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;

  return query
  select n.id,
         p.id,
         p.gh_login,
         public.shown_name(p.name_source, p.display_name, p.gh_name, p.gh_login),
         p.avatar_url,
         p.accent,
         p.avatar_shape,
         n.kind,
         n.at,
         n.seen_at is not null,
         exists (select 1 from public.people_follows f
                  where f.follower_id = me and f.followee_id = p.id)
         and exists (select 1 from public.people_follows f
                      where f.follower_id = p.id and f.followee_id = me)
    from public.follow_news n
    join public.profiles p on p.id = n.other_id
   where n.user_id = me
     and n.at > now() - interval '30 days'
     and not exists (
       select 1 from public.blocks b
        where (b.blocker_id = me and b.blocked_id = n.other_id)
           or (b.blocker_id = n.other_id and b.blocked_id = me)
     )
   order by n.at desc
   limit 50;
end;
$$;

revoke execute on function public.my_follow_news() from public, anon;
grant execute on function public.my_follow_news() to authenticated;

select 'news carries its own seen mark' as step,
       case when exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='follow_news'
                and column_name='seen_at')
       then 'ready' else 'MISSING' end as result
union all
select 'only you can clear your own',
       case when pg_get_functiondef(p.oid) like '%auth.uid()%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='mark_follow_news_seen'
union all
select 'still nobody can write the table',
       coalesce((select string_agg(privilege_type, ', ')
                   from information_schema.role_table_grants
                  where table_schema='public' and table_name='follow_news'
                    and grantee in ('anon','authenticated')), 'no grants');
