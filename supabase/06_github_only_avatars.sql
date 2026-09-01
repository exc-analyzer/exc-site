update public.profiles
   set avatar_source = 'github',
       custom_avatar_url = null
 where avatar_source is distinct from 'github'
    or custom_avatar_url is not null;

drop policy if exists "user uploads own image" on storage.objects;
drop policy if exists "user replaces own image" on storage.objects;
drop policy if exists "user deletes own image" on storage.objects;
drop policy if exists "images are publicly readable" on storage.objects;

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
    gh_avatar_url as shown_avatar
  from public.profiles;

grant select on public.profile_display to anon, authenticated;

alter table public.profiles
  drop column if exists custom_avatar_url,
  drop column if exists avatar_source;

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

  if new.name_source = 'custom' and coalesce(btrim(new.display_name), '') = '' then
    new.name_source := 'github';
  end if;

  return new;
end;
$$;

delete from public.abuse_reports where target_type = 'avatar';

alter table public.abuse_reports
  drop constraint if exists abuse_reports_target_type_check;

alter table public.abuse_reports
  add constraint abuse_reports_target_type_check
  check (target_type in ('comment', 'profile', 'report'));

select 'kolonlar kaldirildi' as kontrol,
       case when not exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'profiles'
            and column_name in ('custom_avatar_url', 'avatar_source')
       ) then 'temiz' else 'HALA VAR' end as sonuc
union all
select 'avatars kovasi',
       case when not exists (select 1 from storage.buckets where id = 'avatars')
            then 'temiz' else 'HALA VAR - panelden sil' end
union all
select 'yuklenmis dosya',
       case when not exists (select 1 from storage.objects where bucket_id = 'avatars')
            then 'temiz' else 'HALA VAR - panelden sil' end;
