create or replace function public.like_count(p_type text, p_id uuid)
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)::integer
    from public.votes
   where target_type = p_type
     and target_id = p_id
     and value = 1;
$$;

revoke all on function public.like_count(text, uuid) from public;
grant execute on function public.like_count(text, uuid) to anon, authenticated;

grant select, insert, update, delete on public.votes to authenticated;

alter table public.abuse_reports drop constraint if exists abuse_reports_target_type_check;
alter table public.abuse_reports
  add constraint abuse_reports_target_type_check
  check (target_type in ('comment', 'profile', 'report', 'post'));

alter table public.posts add column if not exists edited_at timestamptz;

create or replace function public.posts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_created timestamptz;
  recent integer;
begin
  if tg_op = 'INSERT' then
    select created_at into account_created
    from public.profiles
    where id = new.author_id;

    if account_created is null or account_created > now() - interval '24 hours' then
      raise exception 'Posting opens 24 hours after the account is created.';
    end if;

    select count(*) into recent
    from public.posts
    where author_id = new.author_id
      and created_at > now() - interval '1 hour';

    if recent >= 10 then
      raise exception 'Hourly post limit reached.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.author_id  := old.author_id;
    new.created_at := old.created_at;
    if new.body is distinct from old.body and old.deleted_at is null then
      new.edited_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

alter table public.profiles add column if not exists notifications_seen_at timestamptz not null default now();

drop view if exists public.my_replies;
create view public.my_replies
with (security_invoker = on) as
  select
    c.id,
    c.body,
    c.created_at,
    c.author_id            as from_id,
    a.gh_login             as from_login,
    a.avatar_url           as from_avatar,
    c.post_id,
    c.report_id,
    coalesce(po.author_id, re.created_by, parent.author_id) as to_id,
    case
      when c.parent_id is not null then 'comment'
      when c.post_id is not null then 'post'
      else 'report'
    end                    as on_what,
    re.owner               as report_owner,
    re.repo                as report_repo,
    re.kind                as report_kind
  from public.comments c
  join public.profiles a on a.id = c.author_id
  left join public.posts po on po.id = c.post_id
  left join public.reports re on re.id = c.report_id
  left join public.comments parent on parent.id = c.parent_id
  where c.deleted_at is null;

grant select on public.my_replies to authenticated;

create table if not exists public.people_follows (
  follower_id uuid        not null references public.profiles (id) on delete cascade,
  followee_id uuid        not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),

  primary key (follower_id, followee_id),
  constraint people_follows_not_self check (follower_id <> followee_id)
);

create index if not exists people_follows_followee_idx on public.people_follows (followee_id);

alter table public.people_follows enable row level security;

drop policy if exists "people follows are publicly readable" on public.people_follows;
create policy "people follows are publicly readable"
  on public.people_follows for select
  using (true);

drop policy if exists "user follows people as themselves" on public.people_follows;
create policy "user follows people as themselves"
  on public.people_follows for insert
  with check ((select auth.uid()) = follower_id);

drop policy if exists "user unfollows people" on public.people_follows;
create policy "user unfollows people"
  on public.people_follows for delete
  using ((select auth.uid()) = follower_id);

grant select on public.people_follows to anon, authenticated;
grant insert, delete on public.people_follows to authenticated;

create table if not exists public.bookmarks (
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  kind       text        not null check (kind in ('post', 'report')),
  target_id  uuid        not null,
  created_at timestamptz not null default now(),

  primary key (user_id, kind, target_id)
);

alter table public.bookmarks enable row level security;

drop policy if exists "user sees own bookmarks" on public.bookmarks;
create policy "user sees own bookmarks"
  on public.bookmarks for select
  using ((select auth.uid()) = user_id);

drop policy if exists "user saves as themselves" on public.bookmarks;
create policy "user saves as themselves"
  on public.bookmarks for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "user removes own bookmark" on public.bookmarks;
create policy "user removes own bookmark"
  on public.bookmarks for delete
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.bookmarks to authenticated;

alter table public.posts add column if not exists quote_of uuid references public.posts (id) on delete set null;
create index if not exists posts_quote_idx on public.posts (quote_of);

drop view if exists public.feed;
create view public.feed
with (security_invoker = on) as
  select
    'post'::text        as kind,
    p.id                as id,
    p.author_id         as author_id,
    pr.gh_login         as author_login,
    pr.avatar_url       as author_avatar,
    p.body              as body,
    p.repo_owner        as owner,
    p.repo_name         as repo,
    null::text          as report_kind,
    null::integer       as score,
    p.created_at        as happened_at,
    p.edited_at         as edited_at,
    p.quote_of          as quote_id,
    q.body              as quote_body,
    qa.gh_login         as quote_login,
    public.like_count('post', p.id) as likes,
    (select count(*) from public.comments c
      where c.post_id = p.id and c.deleted_at is null) as replies
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  left join public.posts q on q.id = p.quote_of and q.deleted_at is null
  left join public.profiles qa on qa.id = q.author_id
  where p.deleted_at is null

  union all

  select
    'report'::text,
    r.id,
    r.created_by,
    pr.gh_login,
    pr.avatar_url,
    null::text,
    r.owner,
    r.repo,
    r.kind,
    r.score,
    r.updated_at,
    null::timestamptz,
    null::uuid,
    null::text,
    null::text,
    public.like_count('report', r.id),
    (select count(*) from public.comments c
      where c.report_id = r.id and c.deleted_at is null)
  from public.reports r
  left join public.profiles pr on pr.id = r.created_by;

grant select on public.feed to anon, authenticated;

drop view if exists public.member_profile;
create view public.member_profile
with (security_invoker = on) as
  select
    p.id,
    p.gh_login,
    p.avatar_url,
    p.accent,
    p.bio,
    p.created_at,
    case when p.name_source = 'custom' and p.display_name is not null
         then p.display_name
         else coalesce(p.gh_name, p.gh_login)
    end as shown_name,
    (select count(*) from public.posts o
      where o.author_id = p.id and o.deleted_at is null) as post_count,
    (select count(*) from public.reports r where r.created_by = p.id) as scan_count,
    (select count(*) from public.comments c
      where c.author_id = p.id and c.deleted_at is null) as comment_count,
    (select count(*) from public.people_follows f where f.followee_id = p.id) as follower_count,
    (select count(*) from public.people_follows f where f.follower_id = p.id) as following_count
  from public.profiles p;

grant select on public.member_profile to anon, authenticated;

select 'feed readable' as step, (select count(*) from public.feed)::text as result
union all
select 'member profiles', (select count(*) from public.member_profile)::text
union all
select 'people follows', case when exists (select 1 from information_schema.tables
  where table_schema='public' and table_name='people_follows') then 'ready' else 'MISSING' end
union all
select 'bookmarks', case when exists (select 1 from information_schema.tables
  where table_schema='public' and table_name='bookmarks') then 'ready' else 'MISSING' end
union all
select 'bookmarks stay private', case when has_table_privilege('anon','public.bookmarks','SELECT')
  then 'NO - anon can read them' else 'yes' end
union all
select 'votes stay private', case when has_table_privilege('anon','public.votes','SELECT')
  then 'NO - anon can read them' else 'yes' end
union all
select 'every view is caller-scoped', case when (select count(*) from pg_class c
  where c.relname in ('feed','member_profile','my_replies','follow_activity')
    and c.reloptions @> array['security_invoker=on']) = 4 then 'yes' else 'NO - they would leak' end;
