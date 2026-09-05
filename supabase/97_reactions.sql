create or replace function public.message_is_mine_to_see(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.messages m
     where m.id = target
       and ((select auth.uid()) = m.from_id or (select auth.uid()) = m.to_id)
       and not exists (
         select 1 from public.blocks b
          where (b.blocker_id = m.from_id and b.blocked_id = m.to_id)
             or (b.blocker_id = m.to_id and b.blocked_id = m.from_id)
       )
  );
$$;

revoke execute on function public.message_is_mine_to_see(uuid) from public, anon;
grant execute on function public.message_is_mine_to_see(uuid) to authenticated;

create table if not exists public.message_reactions (
  message_id uuid        not null references public.messages (id) on delete cascade,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  emoji      text        not null,
  at         timestamptz not null default now(),
  primary key (message_id, user_id),
  constraint message_reactions_emoji_check
    check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🙏'))
);

create index if not exists message_reactions_msg_idx
  on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

drop policy if exists "reactions live with their conversation" on public.message_reactions;
create policy "reactions live with their conversation"
  on public.message_reactions for select
  to authenticated
  using (public.message_is_mine_to_see(message_id));

drop policy if exists "you react as yourself" on public.message_reactions;
create policy "you react as yourself"
  on public.message_reactions for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.message_is_mine_to_see(message_id)
  );

drop policy if exists "you take back your own reaction" on public.message_reactions;
create policy "you take back your own reaction"
  on public.message_reactions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "you can change your mind" on public.message_reactions;
create policy "you can change your mind"
  on public.message_reactions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.message_reactions from anon, authenticated;
grant select on public.message_reactions to authenticated;
grant insert (message_id, user_id, emoji) on public.message_reactions to authenticated;
grant update (emoji) on public.message_reactions to authenticated;
grant delete on public.message_reactions to authenticated;

create or replace function public.reactions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.at := now();
  else
    new.message_id := old.message_id;
    new.user_id    := old.user_id;
    new.at         := now();
  end if;
  return new;
end;
$$;

drop trigger if exists message_reactions_guard_ins on public.message_reactions;
create trigger message_reactions_guard_ins
  before insert on public.message_reactions
  for each row execute function public.reactions_guard();

drop trigger if exists message_reactions_guard_upd on public.message_reactions;
create trigger message_reactions_guard_upd
  before update on public.message_reactions
  for each row execute function public.reactions_guard();

select 'only the two of you can read reactions' as step,
       case when qual like '%message_is_mine_to_see%' then 'ready' else 'MISSING' end as result
  from pg_policies
 where schemaname='public' and tablename='message_reactions' and cmd='SELECT'
union all
select 'you can only react as yourself',
       case when with_check like '%auth.uid()%' then 'ready' else 'MISSING' end
  from pg_policies
 where schemaname='public' and tablename='message_reactions' and cmd='INSERT'
union all
select 'anonymous has no way in',
       coalesce((select string_agg(privilege_type, ', ')
                   from information_schema.role_table_grants
                  where table_schema='public' and table_name='message_reactions'
                    and grantee='anon'), 'no grants')
union all
select 'only a short list of emoji is allowed',
       case when exists (select 1 from pg_constraint
              where conrelid='public.message_reactions'::regclass
                and conname='message_reactions_emoji_check')
       then 'ready' else 'MISSING' end;
