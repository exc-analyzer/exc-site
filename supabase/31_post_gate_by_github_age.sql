create or replace function public.posts_guard()
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
      raise exception 'This account cannot post yet.';
    end if;

    if github_created is null or github_created > now() - interval '30 days' then
      if account_created > now() - interval '24 hours' then
        raise exception 'Your GitHub account is new, so posting opens 24 hours after you sign in here.';
      end if;
    end if;

    select count(*) into recent
    from public.posts
    where author_id = new.author_id
      and created_at > now() - interval '1 hour';

    if recent >= 10 then
      raise exception 'Hourly post limit reached.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.author_id  := old.author_id;
    new.created_at := old.created_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

select 'post gate looks at github age' as step,
       case when pg_get_functiondef(p.oid) like '%github_created%'
            then 'ready' else 'MISSING' end as result
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'posts_guard';
