create or replace function public.moderate_remove(kind text, subject uuid, why text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  if kind = 'comment' then
    perform set_config('exc.scoring', 'on', true);
    update public.comments
       set deleted_at = now(), body = '[removed]'
     where id = subject and deleted_at is null;
  elsif kind = 'post' then
    update public.posts
       set deleted_at = now(), body = '[removed]'
     where id = subject and deleted_at is null;
  else
    raise exception 'Only a post or a comment can be taken down.';
  end if;

  if not found then
    raise exception 'It is already gone.';
  end if;

  update public.abuse_reports
     set status = 'reviewed'
   where target_type = kind and target_id = subject and status = 'open';
end;
$$;

grant execute on function public.moderate_remove(text, uuid, text) to authenticated;

select 'direct removal' as step,
       case when exists (select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='moderate_remove')
         then 'ready' else 'MISSING' end as result;
