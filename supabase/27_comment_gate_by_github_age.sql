alter table public.profiles
  add column if not exists gh_created_at timestamptz;

create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  new.id            := old.id;
  new.gh_login      := old.gh_login;
  new.gh_name       := coalesce(old.gh_name, new.gh_name);
  new.gh_avatar_url := coalesce(old.gh_avatar_url, new.gh_avatar_url);
  new.gh_created_at := coalesce(old.gh_created_at, new.gh_created_at);
  new.avatar_url    := old.avatar_url;
  new.reputation    := old.reputation;
  new.created_at    := old.created_at;

  if new.name_source = 'custom' and coalesce(btrim(new.display_name), '') = '' then
    new.name_source := 'github';
  end if;

  return new;
end;
$$;

create or replace function public.comments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_created timestamptz;
  github_created  timestamptz;
  recent integer;
begin
  if tg_op = 'INSERT' then
    select p.created_at, p.gh_created_at
      into account_created, github_created
      from public.profiles p
     where p.id = new.author_id;

    if account_created is null then
      raise exception 'This account cannot comment yet.';
    end if;

    if github_created is null or github_created > now() - interval '30 days' then
      if account_created > now() - interval '24 hours' then
        raise exception 'Your GitHub account is new, so commenting opens 24 hours after you sign in here.';
      end if;
    end if;

    select count(*) into recent
    from public.comments
    where author_id = new.author_id
      and created_at > now() - interval '1 hour';

    if recent >= 20 then
      raise exception 'Hourly comment limit reached.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.author_id  := old.author_id;
    new.report_id  := old.report_id;
    new.parent_id  := old.parent_id;
    new.created_at := old.created_at;
    new.vote_score := old.vote_score;

    if new.body is not distinct from old.body then
      new.updated_at := old.updated_at;
      return new;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

select 'gh_created_at column' as step,
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles'
           and column_name = 'gh_created_at')
         then 'ready' else 'MISSING' end as result
union all
select 'gate looks at github age',
       case when pg_get_functiondef(p.oid) like '%github_created%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'comments_guard';
