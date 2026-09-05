drop policy if exists "you receive only your own pings" on realtime.messages;

create table if not exists public.mail_pings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  at      timestamptz not null default now(),
  seq     bigint      not null default 1
);

alter table public.mail_pings enable row level security;

drop policy if exists "you only ever see your own ping" on public.mail_pings;
create policy "you only ever see your own ping"
  on public.mail_pings for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.mail_pings from anon, authenticated;
grant select on public.mail_pings to authenticated;

create or replace function public.nudge(who uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.mail_pings (user_id, at, seq)
  values (who, now(), 1)
  on conflict (user_id) do update
    set at = now(), seq = public.mail_pings.seq + 1;
$$;

revoke execute on function public.nudge(uuid) from public, anon, authenticated;

create or replace function public.messages_ping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.nudge(new.to_id);
  elsif new.deleted_at is distinct from old.deleted_at then
    perform public.nudge(new.to_id);
    perform public.nudge(new.from_id);
  end if;
  return null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'mail_pings'
  ) then
    execute 'alter publication supabase_realtime add table public.mail_pings';
  end if;
end;
$$;

select 'the ping table carries no message text' as step,
       case when not exists (
         select 1 from information_schema.columns
          where table_schema='public' and table_name='mail_pings'
            and column_name in ('body','from_id','message_id'))
       then 'ready' else 'LEAKS' end as result
union all
select 'a member may only read their own ping',
       case when exists (select 1 from pg_policies
              where schemaname='public' and tablename='mail_pings'
                and qual like '%auth.uid()%')
       then 'ready' else 'MISSING' end
union all
select 'nobody but the server may write it',
       coalesce((select string_agg(privilege_type, ', ')
                   from information_schema.role_table_grants
                  where table_schema='public' and table_name='mail_pings'
                    and grantee in ('anon','authenticated')), 'no grants')
union all
select 'it is published for live updates',
       case when exists (select 1 from pg_publication_tables
              where pubname='supabase_realtime' and schemaname='public'
                and tablename='mail_pings')
       then 'ready' else 'MISSING' end
union all
select 'private messages stayed unpublished',
       case when exists (select 1 from pg_publication_tables
              where pubname='supabase_realtime' and schemaname='public'
                and tablename='messages')
       then 'LEAK: messages are being broadcast' else 'correct, never broadcast' end;
