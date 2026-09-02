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

select 'people follows' as step,
       case when exists (select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'people_follows')
         then 'ready' else 'MISSING' end as result
union all
select 'bookmarks',
       case when exists (select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'bookmarks')
         then 'ready' else 'MISSING' end
union all
select 'bookmarks stay private',
       case when has_table_privilege('anon', 'public.bookmarks', 'SELECT')
            then 'NO - anon can read them' else 'yes' end
union all
select 'posts can quote a post',
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'posts' and column_name = 'quote_of')
         then 'yes' else 'NO' end
union all
select 'feed carries the quote',
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'feed' and column_name = 'quote_body')
         then 'yes' else 'NO' end
union all
select 'feed rows',
       (select count(*) from public.feed)::text;
