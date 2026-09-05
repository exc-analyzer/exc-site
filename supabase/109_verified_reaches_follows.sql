create or replace view public.follow_request_inbox
with (security_invoker = on) as
 select r.from_id,
    r.to_id,
    r.created_at,
    p.gh_login,
    p.avatar_url,
    p.accent,
    case
      when p.name_source = 'custom'::text and p.display_name is not null then p.display_name
      else coalesce(p.gh_name, p.gh_login)
    end as shown_name,
    p.verified
   from public.follow_requests r
     join public.profiles p on p.id = r.from_id;

drop function if exists public.my_follow_news();

create function public.my_follow_news()
returns table(
  id uuid,
  other_id uuid,
  gh_login text,
  shown_name text,
  avatar_url text,
  accent text,
  avatar_shape text,
  kind text,
  at timestamp with time zone,
  seen boolean,
  mutual boolean,
  verified boolean
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
                      where f.follower_id = p.id and f.followee_id = me),
         p.verified
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

select 'the request inbox carries the mark' as step,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='follow_request_inbox'
                            and column_name='verified')
       then 'ready' else 'MISSING' end as result
union all
select 'the inbox still runs as the caller',
       case when 'security_invoker=on' = any(c.reloptions)
       then 'ready' else 'RLS BYPASSED' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'follow_request_inbox'
union all
select 'follow news carries the mark',
       case when pg_get_function_result(p.oid) like '%verified boolean%'
       then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'my_follow_news'
union all
select 'signed-out visitors cannot read follow news',
       case when array_to_string(p.proacl, ' ') like '%authenticated=X%'
             and array_to_string(p.proacl, ' ') not like '%anon=X%'
       then 'ready' else 'CHECK IT' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'my_follow_news';
