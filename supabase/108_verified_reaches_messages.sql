drop function if exists public.mutual_people();

create function public.mutual_people()
returns table(
  other_id uuid,
  gh_login text,
  shown_name text,
  avatar_url text,
  accent text,
  avatar_shape text,
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
  select p.id,
         p.gh_login,
         public.shown_name(p.name_source, p.display_name, p.gh_name, p.gh_login),
         p.avatar_url,
         p.accent,
         p.avatar_shape,
         p.verified
    from public.people_follows mine
    join public.people_follows theirs
      on theirs.follower_id = mine.followee_id
     and theirs.followee_id = me
    join public.profiles p on p.id = mine.followee_id
   where mine.follower_id = me
   order by 3;
end;
$$;

revoke execute on function public.mutual_people() from public;
grant execute on function public.mutual_people() to authenticated;

drop function if exists public.my_conversations();

create function public.my_conversations()
returns table(
  other_id uuid,
  gh_login text,
  shown_name text,
  avatar_url text,
  accent text,
  avatar_shape text,
  last_body text,
  last_at timestamp with time zone,
  last_from_me boolean,
  unread bigint,
  still_open boolean,
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
  with pairs as (
    select case when m.from_id = me then m.to_id else m.from_id end as other,
           m.body, m.created_at, m.from_id = me as from_me,
           m.read_at, m.to_id
      from public.messages m
     where m.from_id = me or m.to_id = me
  ),
  open_pairs as (
    select * from pairs p
     where not exists (
       select 1 from public.blocks b
        where (b.blocker_id = me and b.blocked_id = p.other)
           or (b.blocker_id = p.other and b.blocked_id = me)
     )
     and not exists (
       select 1 from public.conversation_clears c
        where c.user_id = me and c.other_id = p.other
          and p.created_at <= c.cleared_at
     )
  ),
  latest as (
    select distinct on (other) other, body, created_at, from_me
      from open_pairs
     order by other, created_at desc
  )
  select l.other,
         p.gh_login,
         public.shown_name(p.name_source, p.display_name, p.gh_name, p.gh_login),
         p.avatar_url,
         p.accent,
         p.avatar_shape,
         l.body,
         l.created_at,
         l.from_me,
         (select count(*) from open_pairs x
           where x.other = l.other and x.to_id = me and x.read_at is null),
         public.follow_is_mutual(me, l.other),
         p.verified
    from latest l
    join public.profiles p on p.id = l.other
   order by l.created_at desc;
end;
$$;

revoke execute on function public.my_conversations() from public;
grant execute on function public.my_conversations() to authenticated;

revoke execute on function public.set_verified(text, boolean) from public, anon;
grant execute on function public.set_verified(text, boolean) to authenticated;

revoke execute on function public.verified_list() from public, anon;
grant execute on function public.verified_list() to authenticated;

select 'the chat list carries the mark' as step,
       case when pg_get_function_result(p.oid) like '%verified boolean%'
       then 'ready' else 'MISSING' end as result
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'my_conversations'
union all
select 'the people picker carries the mark',
       case when pg_get_function_result(p.oid) like '%verified boolean%'
       then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'mutual_people'
union all
select 'signed-out visitors still cannot call them',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public'
                     and p.proname in ('my_conversations','mutual_people','set_verified','verified_list')
                     and array_to_string(p.proacl, ' ') like '%authenticated=X%'
                     and array_to_string(p.proacl, ' ') not like '%anon=X%'
                     and array_to_string(p.proacl, ' ') not like '%=X/postgres,=X%') = 4
       then 'ready' else 'CHECK IT' end
union all
select 'my_profile already carries it',
       case when pg_get_function_result(p.oid) = 'SETOF profiles'
       then 'ready, it returns the whole row' else 'CHECK IT' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'my_profile';
