create or replace function public.thread_is_open(report uuid, post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (report is null or exists (
      select 1 from public.reports r where r.id = report and r.hidden_at is null
    ))
    and
    (post is null or exists (
      select 1
        from public.posts p
        join public.profiles a on a.id = p.author_id
       where p.id = post
         and p.deleted_at is null
         and (not coalesce(a.private_account, false) or public.sees_private(a.id))
    ));
$$;

create or replace function public.comments_no_resurrection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    if new.deleted_at is null or new.body is distinct from old.body then
      raise exception 'This comment has been removed. It cannot be brought back.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists comments_no_resurrection_upd on public.comments;
create trigger comments_no_resurrection_upd
  before update on public.comments
  for each row execute function public.comments_no_resurrection();

create or replace function public.posts_no_resurrection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    if new.deleted_at is null or new.body is distinct from old.body then
      raise exception 'This post has been removed. It cannot be brought back.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_no_resurrection_upd on public.posts;
create trigger posts_no_resurrection_upd
  before update on public.posts
  for each row execute function public.posts_no_resurrection();

create or replace function public.people_follows_respect_privacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  guarded boolean;
begin
  select coalesce(private_account, false) into guarded
    from public.profiles where id = new.followee_id;

  if guarded and new.followee_id <> coalesce((select auth.uid()), new.followee_id) then
    raise exception 'This account approves its followers. Send a request instead.';
  end if;

  return new;
end;
$$;

drop trigger if exists people_follows_privacy_ins on public.people_follows;
create trigger people_follows_privacy_ins
  before insert on public.people_follows
  for each row execute function public.people_follows_respect_privacy();

drop policy if exists "a scanner refreshes only a report that is theirs" on public.reports;
create policy "a scanner refreshes only their own report"
  on public.reports for update
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

revoke update on public.comments from authenticated;
grant update (body, deleted_at, edited_at, vote_score) on public.comments to authenticated;

create or replace function public.reports_respect_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_suppressed(new.owner) then
    raise exception 'This repository cannot be published here.';
  end if;
  return new;
end;
$$;

select 'a removed comment stays removed' as step,
       case when exists (select 1 from pg_trigger where tgname='comments_no_resurrection_upd' and not tgisinternal)
       then 'ready' else 'MISSING' end as result
union all
select 'a removed post stays removed',
       case when exists (select 1 from pg_trigger where tgname='posts_no_resurrection_upd' and not tgisinternal)
       then 'ready' else 'MISSING' end
union all
select 'a private account approves its followers',
       case when exists (select 1 from pg_trigger where tgname='people_follows_privacy_ins' and not tgisinternal)
       then 'ready' else 'MISSING' end
union all
select 'an abandoned report cannot be seized',
       case when (select qual::text from pg_policies
                   where schemaname='public' and tablename='reports' and cmd='UPDATE')
                 not like '%is null%'
       then 'ready' else 'STILL OPEN' end
union all
select 'the pin flag is out of reach',
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='comments'
            and column_name='pinned_at' and grantee='authenticated'
            and privilege_type='UPDATE')
       then 'closed' else 'STILL OPEN' end
union all
select 'the suppression list no longer answers probes',
       case when pg_get_functiondef(p.oid) not like '%asked not to be listed%'
            then 'closed' else 'STILL OPEN' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='reports_respect_suppression';
