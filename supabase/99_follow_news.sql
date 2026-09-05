create table if not exists public.follow_news (
  id       uuid        primary key default gen_random_uuid(),
  user_id  uuid        not null references public.profiles (id) on delete cascade,
  other_id uuid        not null references public.profiles (id) on delete cascade,
  kind     text        not null check (kind in ('accepted', 'followed')),
  at       timestamptz not null default now(),
  check (user_id <> other_id)
);

create index if not exists follow_news_user_idx on public.follow_news (user_id, at desc);

alter table public.follow_news enable row level security;

drop policy if exists "you read only news meant for you" on public.follow_news;
create policy "you read only news meant for you"
  on public.follow_news for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.follow_news from anon, authenticated;
grant select on public.follow_news to authenticated;

create or replace function public.accept_follow_request(requester uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid;
begin
  me := (select auth.uid());
  if me is null then
    raise exception 'Sign in first.';
  end if;

  delete from public.follow_requests
   where from_id = requester and to_id = me;

  if not found then
    raise exception 'There is no such request.';
  end if;

  insert into public.people_follows (follower_id, followee_id)
  values (requester, me)
  on conflict do nothing;

  insert into public.follow_news (user_id, other_id, kind)
  values (requester, me, 'accepted');

  perform public.nudge(requester);
end;
$$;

create or replace function public.my_follow_news()
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

create or replace function public.purge_follow_news()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.follow_news where at < now() - interval '30 days';
$$;

revoke execute on function public.purge_follow_news() from public, anon, authenticated;

select cron.schedule('purge-follow-news', '23 4 * * *',
                     'select public.purge_follow_news()')
 where not exists (select 1 from cron.job where jobname = 'purge-follow-news');

select 'accepting tells the person who asked' as step,
       case when pg_get_functiondef(p.oid) like '%nudge(requester)%'
            and pg_get_functiondef(p.oid) like '%follow_news%'
       then 'ready' else 'MISSING' end as result
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='accept_follow_request'
union all
select 'the news is readable only by its owner',
       case when exists (select 1 from pg_policies
              where schemaname='public' and tablename='follow_news'
                and qual like '%auth.uid()%')
       then 'ready' else 'MISSING' end
union all
select 'nobody can write it from outside',
       coalesce((select string_agg(privilege_type, ', ')
                   from information_schema.role_table_grants
                  where table_schema='public' and table_name='follow_news'
                    and grantee in ('anon','authenticated')), 'no grants');
