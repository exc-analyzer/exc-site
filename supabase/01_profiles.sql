create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  gh_login    text        not null,
  avatar_url  text,
  bio         text        check (char_length(bio) <= 280),
  reputation  integer     not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles for select
  using (true);

drop policy if exists "user creates own profile" on public.profiles;
create policy "user creates own profile"
  on public.profiles for insert
  with check ((select auth.uid()) = id);

drop policy if exists "user updates own profile" on public.profiles;
create policy "user updates own profile"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  new.id         := old.id;
  new.gh_login   := old.gh_login;
  new.avatar_url := old.avatar_url;
  new.reputation := old.reputation;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.profiles_guard();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, gh_login, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'user_name',
      new.raw_user_meta_data ->> 'preferred_username',
      'user-' || left(new.id::text, 8)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

grant usage on schema public to anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

create index if not exists profiles_gh_login_idx on public.profiles (gh_login);
