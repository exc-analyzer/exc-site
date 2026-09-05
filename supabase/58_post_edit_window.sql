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

    if new.body is distinct from old.body
       and old.deleted_at is null
       and new.deleted_at is null
       and old.created_at < now() - interval '5 minutes' then
      raise exception 'A post can be edited for 5 minutes. After that it stands as written.';
    end if;

    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

select 'a post is editable for five minutes' as step,
       case when pg_get_functiondef(p.oid) like '%5 minutes%'
            then 'ready' else 'MISSING' end as result
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='posts_guard'
union all
select 'taking a post down is still allowed at any time',
       case when pg_get_functiondef(p.oid) like '%new.deleted_at is null%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='posts_guard';
