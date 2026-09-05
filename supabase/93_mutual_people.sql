create or replace function public.mutual_people()
returns table (
  other_id     uuid,
  gh_login     text,
  shown_name   text,
  avatar_url   text,
  accent       text,
  avatar_shape text
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
  select p.id,
         p.gh_login,
         public.shown_name(p.name_source, p.display_name, p.gh_name, p.gh_login),
         p.avatar_url,
         p.accent,
         p.avatar_shape
    from public.people_follows mine
    join public.people_follows theirs
      on theirs.follower_id = mine.followee_id
     and theirs.followee_id = me
    join public.profiles p on p.id = mine.followee_id
   where mine.follower_id = me
   order by 3;
end;
$$;

revoke execute on function public.mutual_people() from public, anon;
grant execute on function public.mutual_people() to authenticated;

select 'it only answers about the caller' as step,
       case when pg_get_functiondef(p.oid) like '%auth.uid()%'
            and pg_get_functiondef(p.oid) like '%theirs.followee_id = me%'
       then 'ready' else 'MISSING' end as result
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='mutual_people'
union all
select 'anonymous callers are refused',
       case when has_function_privilege('anon', 'public.mutual_people()', 'execute')
            then 'OPEN' else 'closed' end;
