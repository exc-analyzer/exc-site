create table if not exists public.blocks (
  blocker_id uuid        not null references public.profiles (id) on delete cascade,
  blocked_id uuid        not null references public.profiles (id) on delete cascade,
  at         timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

drop policy if exists "you see only the blocks you made" on public.blocks;
create policy "you see only the blocks you made"
  on public.blocks for select
  to authenticated
  using ((select auth.uid()) = blocker_id);

revoke all on public.blocks from anon, authenticated;
grant select on public.blocks to authenticated;

create or replace function public.blocked_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null or other is null then false
    else exists (
      select 1 from public.blocks b
       where (b.blocker_id = (select auth.uid()) and b.blocked_id = other)
          or (b.blocker_id = other and b.blocked_id = (select auth.uid()))
    )
  end;
$$;

revoke execute on function public.blocked_with(uuid) from public;
grant execute on function public.blocked_with(uuid) to anon, authenticated;

create or replace function public.block_person(other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;
  if me = other then
    raise exception 'You cannot block yourself.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = other) then
    raise exception 'No such person.';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (me, other)
  on conflict do nothing;

  delete from public.people_follows
   where (follower_id = me and followee_id = other)
      or (follower_id = other and followee_id = me);
end;
$$;

create or replace function public.unblock_person(other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;
  delete from public.blocks
   where blocker_id = me and blocked_id = other;
end;
$$;

create or replace function public.my_blocks()
returns table (
  other_id     uuid,
  gh_login     text,
  shown_name   text,
  avatar_url   text,
  accent       text,
  avatar_shape text,
  at           timestamptz
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
         b.at
    from public.blocks b
    join public.profiles p on p.id = b.blocked_id
   where b.blocker_id = me
   order by b.at desc;
end;
$$;

revoke execute on function public.block_person(uuid) from public, anon;
revoke execute on function public.unblock_person(uuid) from public, anon;
revoke execute on function public.my_blocks() from public, anon;
grant execute on function public.block_person(uuid) to authenticated;
grant execute on function public.unblock_person(uuid) to authenticated;
grant execute on function public.my_blocks() to authenticated;

create or replace function public.follows_block_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.blocks b
     where (b.blocker_id = new.follower_id and b.blocked_id = new.followee_id)
        or (b.blocker_id = new.followee_id and b.blocked_id = new.follower_id)
  ) then
    raise exception 'There is a block between you two.';
  end if;
  return new;
end;
$$;

drop trigger if exists people_follows_block_ins on public.people_follows;
create trigger people_follows_block_ins
  before insert on public.people_follows
  for each row execute function public.follows_block_guard();

drop policy if exists "posts are readable unless removed or private" on public.posts;
create policy "posts are readable unless removed or private"
  on public.posts for select
  using (
    author_id = (select auth.uid())
    or (
      deleted_at is null
      and exists (
        select 1 from public.profiles p
         where p.id = posts.author_id
           and (not coalesce(p.private_account, false) or public.sees_private(p.id))
      )
      and not public.blocked_with(posts.author_id)
    )
  );

drop policy if exists "comments follow the thing they hang on" on public.comments;
create policy "comments follow the thing they hang on"
  on public.comments for select
  using (
    author_id = (select auth.uid())
    or (
      public.thread_is_open(report_id, post_id)
      and not public.blocked_with(comments.author_id)
    )
  );

drop policy if exists "reports are readable unless taken down" on public.reports;
create policy "reports are readable unless taken down"
  on public.reports for select
  using (
    created_by = (select auth.uid())
    or (hidden_at is null and not public.blocked_with(created_by))
  );

drop policy if exists "you read only your own conversations" on public.messages;
create policy "you read only your own conversations"
  on public.messages for select
  to authenticated
  using (
    ((select auth.uid()) = from_id or (select auth.uid()) = to_id)
    and not public.blocked_with(
      case when (select auth.uid()) = from_id then to_id else from_id end
    )
  );

select 'a block hides them from your feed' as step,
       case when qual like '%blocked_with%' then 'ready' else 'MISSING' end as result
  from pg_policies where schemaname='public' and tablename='posts' and cmd='SELECT'
union all
select 'and their comments',
       case when qual like '%blocked_with%' then 'ready' else 'MISSING' end
  from pg_policies where schemaname='public' and tablename='comments' and cmd='SELECT'
union all
select 'and their scans',
       case when qual like '%blocked_with%' then 'ready' else 'MISSING' end
  from pg_policies where schemaname='public' and tablename='reports' and cmd='SELECT'
union all
select 'and the conversation',
       case when qual like '%blocked_with%' then 'ready' else 'MISSING' end
  from pg_policies where schemaname='public' and tablename='messages' and cmd='SELECT'
union all
select 'nobody can see who blocked them',
       case when exists (
         select 1 from pg_policies where schemaname='public' and tablename='blocks'
           and qual like '%blocker_id%' and qual not like '%blocked_id%')
       then 'ready' else 'CHECK IT' end;
