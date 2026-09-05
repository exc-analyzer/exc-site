create table if not exists public.moderators (
  id       uuid        primary key references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  note     text
);

alter table public.moderators enable row level security;

drop policy if exists "a moderator sees only their own badge" on public.moderators;
create policy "a moderator sees only their own badge"
  on public.moderators for select
  using ((select auth.uid()) = id);

revoke all on public.moderators from anon, authenticated;
grant select on public.moderators to authenticated;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.moderators m where m.id = (select auth.uid())
  );
$$;

grant execute on function public.is_moderator() to authenticated;

drop policy if exists "reporter sees own filing" on public.abuse_reports;
create policy "reporter sees own filing"
  on public.abuse_reports for select
  using ((select auth.uid()) = reporter_id or public.is_moderator());

create or replace function public.abuse_reports_guard()
returns trigger
language plpgsql
as $$
begin
  new.id          := old.id;
  new.target_type := old.target_type;
  new.target_id   := old.target_id;
  new.reporter_id := old.reporter_id;
  new.reason      := old.reason;
  new.created_at  := old.created_at;
  return new;
end;
$$;

drop trigger if exists abuse_reports_guard_upd on public.abuse_reports;
create trigger abuse_reports_guard_upd
  before update on public.abuse_reports
  for each row execute function public.abuse_reports_guard();

create or replace function public.moderation_queue()
returns table (
  id           uuid,
  created_at   timestamptz,
  target_type  text,
  target_id    uuid,
  reason       text,
  status       text,
  reported_by  text,
  body         text,
  author_login text,
  gone         boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  return query
  select a.id,
         a.created_at,
         a.target_type,
         a.target_id,
         a.reason,
         a.status,
         rp.gh_login,
         coalesce(c.body, po.body),
         coalesce(ca.gh_login, pa.gh_login),
         coalesce(c.deleted_at, po.deleted_at) is not null
    from public.abuse_reports a
    join public.profiles rp on rp.id = a.reporter_id
    left join public.comments c on a.target_type = 'comment' and c.id = a.target_id
    left join public.profiles ca on ca.id = c.author_id
    left join public.posts po on a.target_type = 'post' and po.id = a.target_id
    left join public.profiles pa on pa.id = po.author_id
   order by (a.status = 'open') desc, a.created_at desc;
end;
$$;

grant execute on function public.moderation_queue() to authenticated;

create or replace function public.moderate_take_down(filing uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text;
  subject uuid;
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  select a.target_type, a.target_id into kind, subject
    from public.abuse_reports a where a.id = filing;

  if not found then
    raise exception 'No such filing.';
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
    raise exception 'Nothing to take down for this kind of filing.';
  end if;

  update public.abuse_reports set status = 'reviewed' where id = filing;
end;
$$;

grant execute on function public.moderate_take_down(uuid) to authenticated;

create or replace function public.moderate_settle(filing uuid, verdict text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  if verdict not in ('reviewed', 'dismissed', 'open') then
    raise exception 'Unknown verdict.';
  end if;

  update public.abuse_reports set status = verdict where id = filing;

  if not found then
    raise exception 'No such filing.';
  end if;
end;
$$;

grant execute on function public.moderate_settle(uuid, text) to authenticated;

insert into public.moderators (id, note)
select p.id, 'site owner'
  from public.profiles p
 where p.gh_login = 'brgkdm'
on conflict (id) do nothing;

select 'moderators table' as step,
       case when exists (select 1 from information_schema.tables
         where table_schema='public' and table_name='moderators')
         then 'ready' else 'MISSING' end as result
union all
select 'nobody can write to it through the api',
       case when not exists (
         select 1 from information_schema.role_table_grants
          where table_schema='public' and table_name='moderators'
            and grantee in ('anon','authenticated')
            and privilege_type in ('INSERT','UPDATE','DELETE'))
         then 'locked' else 'OPEN' end
union all
select 'seeded moderators',
       (select count(*)::text from public.moderators);
