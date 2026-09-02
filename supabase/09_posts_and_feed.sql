create table if not exists public.posts (
  id         uuid        primary key default gen_random_uuid(),
  author_id  uuid        not null references public.profiles (id) on delete cascade,
  body       text        not null check (char_length(btrim(body)) between 1 and 4000),
  repo_owner text        not null default '' check (char_length(repo_owner) <= 100),
  repo_name  text        not null default '' check (char_length(repo_name) <= 200),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_idx  on public.posts (author_id);
create index if not exists posts_repo_idx    on public.posts (repo_owner, repo_name);

alter table public.posts enable row level security;

drop policy if exists "posts are publicly readable" on public.posts;
create policy "posts are publicly readable"
  on public.posts for select
  using (true);

drop policy if exists "user posts as themselves" on public.posts;
create policy "user posts as themselves"
  on public.posts for insert
  with check ((select auth.uid()) = author_id);

drop policy if exists "user edits own post" on public.posts;
create policy "user edits own post"
  on public.posts for update
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

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
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists posts_guard_ins on public.posts;
create trigger posts_guard_ins
  before insert on public.posts
  for each row execute function public.posts_guard();

drop trigger if exists posts_guard_upd on public.posts;
create trigger posts_guard_upd
  before update on public.posts
  for each row execute function public.posts_guard();

grant select on public.posts to anon, authenticated;
grant insert, update on public.posts to authenticated;

alter table public.comments add column if not exists post_id uuid references public.posts (id) on delete cascade;
alter table public.comments alter column report_id drop not null;

alter table public.comments drop constraint if exists comments_one_target;
alter table public.comments
  add constraint comments_one_target
  check (num_nonnulls(report_id, post_id) = 1);

create index if not exists comments_post_idx on public.comments (post_id, created_at);

create or replace function public.comments_guard()
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
      raise exception 'Comments open 24 hours after the account is created.';
    end if;

    select count(*) into recent
    from public.comments
    where author_id = new.author_id
      and created_at > now() - interval '1 hour';

    if recent >= 20 then
      raise exception 'Hourly comment limit reached.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.author_id  := old.author_id;
    new.report_id  := old.report_id;
    new.post_id    := old.post_id;
    new.parent_id  := old.parent_id;
    new.created_at := old.created_at;
    new.vote_score := old.vote_score;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

alter table public.votes drop constraint if exists votes_target_type_check;
alter table public.votes
  add constraint votes_target_type_check
  check (target_type in ('report', 'comment', 'post'));

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

drop view if exists public.feed;
create view public.feed
with (security_invoker = on) as
  select
    'post'::text                         as kind,
    p.id                                 as id,
    p.author_id                          as author_id,
    pr.gh_login                          as author_login,
    pr.avatar_url                        as author_avatar,
    p.body                               as body,
    p.repo_owner                         as owner,
    p.repo_name                          as repo,
    null::text                           as report_kind,
    null::integer                        as score,
    p.created_at                         as happened_at,
    public.like_count('post', p.id) as likes,
    (select count(*) from public.comments c
      where c.post_id = p.id and c.deleted_at is null)                     as replies
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
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
    public.like_count('report', r.id),
    (select count(*) from public.comments c
      where c.report_id = r.id and c.deleted_at is null)
  from public.reports r
  left join public.profiles pr on pr.id = r.created_by;

grant select on public.feed to anon, authenticated;

select 'posts table' as step,
       case when exists (select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'posts')
         then 'ready' else 'MISSING' end as result
union all
select 'posts row level security',
       case when (select relrowsecurity from pg_class where oid = 'public.posts'::regclass)
         then 'on' else 'OFF - do not use' end
union all
select 'comments accept a post',
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'comments' and column_name = 'post_id')
         then 'yes' else 'NO' end
union all
select 'votes accept a post',
       case when exists (select 1 from information_schema.check_constraints
         where constraint_name = 'votes_target_type_check' and check_clause like '%post%')
         then 'yes' else 'NO' end
union all
select 'feed view is caller-scoped',
       case when exists (select 1 from pg_class c
         where c.relname = 'feed' and c.reloptions @> array['security_invoker=on'])
         then 'yes' else 'NO - it would leak' end
union all
select 'feed rows visible now',
       (select count(*) from public.feed)::text;
