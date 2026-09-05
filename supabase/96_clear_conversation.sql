create table if not exists public.conversation_clears (
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  other_id   uuid        not null references public.profiles (id) on delete cascade,
  cleared_at timestamptz not null default now(),
  primary key (user_id, other_id)
);

alter table public.conversation_clears enable row level security;

drop policy if exists "you see only your own clears" on public.conversation_clears;
create policy "you see only your own clears"
  on public.conversation_clears for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.conversation_clears from anon, authenticated;
grant select on public.conversation_clears to authenticated;

create or replace function public.clear_conversation(other uuid)
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

  insert into public.conversation_clears (user_id, other_id, cleared_at)
  values (me, other, now())
  on conflict (user_id, other_id) do update set cleared_at = now();
end;
$$;

revoke execute on function public.clear_conversation(uuid) from public, anon;
grant execute on function public.clear_conversation(uuid) to authenticated;

drop policy if exists "you read only your own conversations" on public.messages;
create policy "you read only your own conversations"
  on public.messages for select
  to authenticated
  using (
    ((select auth.uid()) = from_id or (select auth.uid()) = to_id)
    and not public.blocked_with(
      case when (select auth.uid()) = from_id then to_id else from_id end
    )
    and not exists (
      select 1 from public.conversation_clears c
       where c.user_id = (select auth.uid())
         and c.other_id = case when (select auth.uid()) = from_id
                               then messages.to_id else messages.from_id end
         and messages.created_at <= c.cleared_at
    )
  );

create or replace function public.my_conversations()
returns table (
  other_id     uuid,
  gh_login     text,
  shown_name   text,
  avatar_url   text,
  accent       text,
  avatar_shape text,
  last_body    text,
  last_at      timestamptz,
  last_from_me boolean,
  unread       bigint,
  still_open   boolean
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
         public.follow_is_mutual(me, l.other)
    from latest l
    join public.profiles p on p.id = l.other
   order by l.created_at desc;
end;
$$;

select 'clearing only touches your own side' as step,
       case when exists (select 1 from pg_policies
              where schemaname='public' and tablename='conversation_clears'
                and qual like '%auth.uid()%')
       then 'ready' else 'MISSING' end as result
union all
select 'cleared messages leave your thread',
       case when qual like '%conversation_clears%' then 'ready' else 'MISSING' end
  from pg_policies where schemaname='public' and tablename='messages' and cmd='SELECT'
union all
select 'nobody may write the clear table directly',
       coalesce((select string_agg(privilege_type, ', ')
                   from information_schema.role_table_grants
                  where table_schema='public' and table_name='conversation_clears'
                    and grantee in ('anon','authenticated')), 'no grants');
