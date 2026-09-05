create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  new.id            := old.id;
  new.gh_login      := old.gh_login;
  new.gh_name       := coalesce(old.gh_name, new.gh_name);
  new.gh_avatar_url := coalesce(old.gh_avatar_url, new.gh_avatar_url);
  new.avatar_url    := old.avatar_url;
  new.reputation    := old.reputation;
  new.created_at    := old.created_at;

  if new.name_source = 'custom' and coalesce(btrim(new.display_name), '') = '' then
    new.name_source := 'github';
  end if;

  return new;
end;
$$;

select 'guard allows filling a blank name' as step,
       case when pg_get_functiondef(p.oid) like '%coalesce(old.gh_name, new.gh_name)%'
            then 'ready' else 'MISSING' end as result
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'profiles_guard';
