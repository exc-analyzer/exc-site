alter table public.comments
  add column if not exists pinned_at timestamptz;

create index if not exists comments_pinned_idx
  on public.comments (post_id, report_id, pinned_at desc)
  where pinned_at is not null;

create or replace function public.comments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_created timestamptz;
  recent integer;
begin
  if tg_op = 'INSERT' then
    select created_at into account_created
    from public.profiles
    where id = new.author_id;

    if account_created is null or account_created > now() - interval '24 hours' then
      raise exception 'Comments open 24 hours after the account is created.';
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

create or replace function public.set_comment_pin(comment_id uuid, pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  on_post uuid;
  on_report uuid;
  holder uuid;
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;

  select c.post_id, c.report_id into on_post, on_report
    from public.comments c
   where c.id = comment_id and c.deleted_at is null;

  if not found then
    raise exception 'No such comment.';
  end if;

  if on_post is not null then
    select p.author_id into holder from public.posts p where p.id = on_post;
  else
    select r.created_by into holder from public.reports r where r.id = on_report;
  end if;

  if holder is null or holder <> me then
    raise exception 'Only the person this belongs to can pin a comment on it.';
  end if;

  if pinned then
    update public.comments
       set pinned_at = null
     where pinned_at is not null
       and (
         (on_post is not null and post_id = on_post)
         or (on_report is not null and report_id = on_report)
       );

    update public.comments set pinned_at = now() where id = comment_id;
  else
    update public.comments set pinned_at = null where id = comment_id;
  end if;
end;
$$;

grant execute on function public.set_comment_pin(uuid, boolean) to authenticated;

select 'pinned_at column' as step,
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'comments'
           and column_name = 'pinned_at')
         then 'ready' else 'MISSING' end as result
union all
select 'pin function',
       case when exists (select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'set_comment_pin')
         then 'ready' else 'MISSING' end
union all
select 'pinning no longer marks a comment edited',
       case when pg_get_functiondef(p.oid) like '%new.updated_at := old.updated_at%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'comments_guard';
