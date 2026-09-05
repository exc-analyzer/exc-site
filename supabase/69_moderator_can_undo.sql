create or replace function public.posts_no_resurrection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is not null and not public.is_moderator() then
    if new.deleted_at is null or new.body is distinct from old.body then
      raise exception 'This post has been removed. It cannot be brought back.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.comments_no_resurrection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is not null and not public.is_moderator() then
    if new.deleted_at is null or new.body is distinct from old.body then
      raise exception 'This comment has been removed. It cannot be brought back.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.moderate_restore(kind text, subject uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  if kind = 'post' then
    update public.posts set deleted_at = null where id = subject;
  elsif kind = 'comment' then
    update public.comments set deleted_at = null where id = subject;
  elsif kind = 'report' then
    update public.reports set hidden_at = null where id = subject;
  else
    raise exception 'Unknown kind.';
  end if;
end;
$$;

revoke execute on function public.moderate_restore(text, uuid) from public;
grant execute on function public.moderate_restore(text, uuid) to authenticated;

select 'an author still cannot resurrect' as step,
       case when pg_get_functiondef(p.oid) like '%cannot be brought back%'
            then 'ready' else 'MISSING' end as result
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='posts_no_resurrection'
union all
select 'a moderator can undo a mistake',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='moderate_restore')
       then 'ready' else 'MISSING' end;
