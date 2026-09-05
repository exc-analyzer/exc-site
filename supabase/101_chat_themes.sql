create table if not exists public.chat_themes (
  user_id  uuid        not null references public.profiles (id) on delete cascade,
  other_id uuid        not null references public.profiles (id) on delete cascade,
  theme    text        not null,
  at       timestamptz not null default now(),
  primary key (user_id, other_id),
  constraint chat_themes_theme_check
    check (theme in ('plain', 'love', 'game', 'forest', 'sunset', 'ocean', 'mono'))
);

alter table public.chat_themes enable row level security;

drop policy if exists "you see only your own choices" on public.chat_themes;
create policy "you see only your own choices"
  on public.chat_themes for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.chat_themes from anon, authenticated;
grant select on public.chat_themes to authenticated;

create or replace function public.set_chat_theme(other uuid, choice text)
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
    raise exception 'That is you.';
  end if;

  if choice = 'plain' then
    delete from public.chat_themes where user_id = me and other_id = other;
    return;
  end if;

  insert into public.chat_themes (user_id, other_id, theme, at)
  values (me, other, choice, now())
  on conflict (user_id, other_id)
    do update set theme = excluded.theme, at = now();
end;
$$;

create or replace function public.my_chat_themes()
returns table (other_id uuid, theme text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.other_id, t.theme
    from public.chat_themes t
   where t.user_id = (select auth.uid());
$$;

revoke execute on function public.set_chat_theme(uuid, text) from public, anon;
revoke execute on function public.my_chat_themes() from public, anon;
grant execute on function public.set_chat_theme(uuid, text) to authenticated;
grant execute on function public.my_chat_themes() to authenticated;

select 'only a known theme name is accepted' as step,
       case when exists (select 1 from pg_constraint
              where conrelid='public.chat_themes'::regclass
                and conname='chat_themes_theme_check')
       then 'ready' else 'MISSING' end as result
union all
select 'a choice is yours alone',
       case when exists (select 1 from pg_policies
              where schemaname='public' and tablename='chat_themes'
                and qual like '%auth.uid()%')
       then 'ready' else 'MISSING' end
union all
select 'nobody writes the table directly',
       coalesce((select string_agg(privilege_type, ', ')
                   from information_schema.role_table_grants
                  where table_schema='public' and table_name='chat_themes'
                    and grantee in ('anon','authenticated')), 'no grants');
