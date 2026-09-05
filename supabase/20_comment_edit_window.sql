create or replace function public.comments_edit_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null or old.deleted_at is not null then
    return new;
  end if;

  if new.body is distinct from old.body
     and old.created_at < now() - interval '15 minutes' then
    raise exception 'A comment can be edited for 15 minutes. After that it stands as written.';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_edit_window_upd on public.comments;
create trigger comments_edit_window_upd
  before update on public.comments
  for each row execute function public.comments_edit_window();

select 'edit window trigger' as step,
       case when exists (select 1 from pg_trigger
         where tgname = 'comments_edit_window_upd' and not tgisinternal)
         then 'ready' else 'MISSING' end as result;
