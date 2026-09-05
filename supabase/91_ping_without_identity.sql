alter table public.profiles
  add column if not exists mail_key uuid not null default gen_random_uuid();

create unique index if not exists profiles_mail_key_idx on public.profiles (mail_key);

create or replace function public.my_mail_key()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.mail_key from public.profiles p where p.id = (select auth.uid());
$$;

revoke execute on function public.my_mail_key() from public, anon;
grant execute on function public.my_mail_key() to authenticated;

drop table if exists public.mail_pings;

create table public.mail_pings (
  key uuid        primary key,
  at  timestamptz not null default now(),
  seq bigint      not null default 1
);

alter table public.mail_pings enable row level security;

create policy "you only ever see your own ping"
  on public.mail_pings for select
  to authenticated
  using (key = public.my_mail_key());

revoke all on public.mail_pings from anon, authenticated;
grant select on public.mail_pings to authenticated;

create or replace function public.nudge(who uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.mail_pings (key, at, seq)
  select p.mail_key, now(), 1
    from public.profiles p
   where p.id = who
  on conflict (key) do update
    set at = now(), seq = public.mail_pings.seq + 1;
$$;

revoke execute on function public.nudge(uuid) from public, anon, authenticated;

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

select 'the ping row names nobody' as step,
       case when not exists (
         select 1 from information_schema.columns
          where table_schema='public' and table_name='mail_pings'
            and column_name in ('user_id','body','from_id'))
       then 'ready' else 'STILL NAMES SOMEBODY' end as result
union all
select 'the routing key is not readable',
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='profiles'
            and column_name='mail_key' and grantee in ('anon','authenticated'))
       then 'ready' else 'EXPOSED' end
union all
select 'every member has a key',
       case when not exists (select 1 from public.profiles where mail_key is null)
       then 'ready' else 'SOME MISSING' end
union all
select 'the ping table is published',
       case when exists (select 1 from pg_publication_tables
              where pubname='supabase_realtime' and schemaname='public'
                and tablename='mail_pings')
       then 'ready' else 'MISSING' end;
