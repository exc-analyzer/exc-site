alter table public.profiles

  add column if not exists gh_name          text,
  add column if not exists gh_avatar_url    text,

  add column if not exists display_name     text check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  add column if not exists custom_avatar_url text check (custom_avatar_url is null or custom_avatar_url ~ '^https://'),

  add column if not exists name_source      text not null default 'github' check (name_source in ('github', 'custom')),
  add column if not exists avatar_source    text not null default 'github' check (avatar_source in ('github', 'custom')),

  add column if not exists accent           text not null default 'indigo' check (accent in ('indigo', 'violet', 'pink', 'emerald', 'amber')),

  add column if not exists onboarded_at     timestamptz;

update public.profiles
   set gh_avatar_url = coalesce(gh_avatar_url, avatar_url)
 where gh_avatar_url is null;

create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  new.id            := old.id;
  new.gh_login      := old.gh_login;
  new.gh_name       := old.gh_name;
  new.gh_avatar_url := old.gh_avatar_url;
  new.avatar_url    := old.avatar_url;
  new.reputation    := old.reputation;
  new.created_at    := old.created_at;

  if new.avatar_source = 'custom' and coalesce(btrim(new.custom_avatar_url), '') = '' then
    new.avatar_source := 'github';
  end if;

  if new.name_source = 'custom' and coalesce(btrim(new.display_name), '') = '' then
    new.name_source := 'github';
  end if;

  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, gh_login, avatar_url, gh_avatar_url, gh_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'user_name',
      new.raw_user_meta_data ->> 'preferred_username',
      'kullanici-' || left(new.id::text, 8)
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace view public.profile_display as
  select
    id,
    gh_login,
    accent,
    reputation,
    bio,
    created_at,
    onboarded_at,
    case when name_source = 'custom' and display_name is not null
         then display_name
         else coalesce(gh_name, gh_login)
    end as shown_name,
    case when avatar_source = 'custom' and custom_avatar_url is not null
         then custom_avatar_url
         else gh_avatar_url
    end as shown_avatar
  from public.profiles;

grant select on public.profile_display to anon, authenticated;
