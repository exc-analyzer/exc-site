create table if not exists public.feedback (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author_id  uuid        references public.profiles (id) on delete set null,
  kind       text        not null check (kind in ('idea', 'problem', 'other')),
  body       text        not null check (char_length(btrim(body)) between 10 and 2000),
  status     text        not null default 'open' check (status in ('open', 'done')),
  handled_at timestamptz
);

alter table public.feedback enable row level security;

revoke all on public.feedback from anon, authenticated;
grant insert on public.feedback to authenticated;

create policy "you may send feedback as yourself"
  on public.feedback for insert to authenticated
  with check (author_id = (select auth.uid()));

create index if not exists feedback_open_idx
  on public.feedback (status, created_at desc);

create or replace function public.feedback_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  select count(*) into recent
    from public.feedback f
   where f.author_id = new.author_id
     and f.created_at > now() - interval '1 hour';

  if recent >= 5 then
    raise exception 'That is enough for one hour. Come back a bit later.';
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_rate_limit_ins on public.feedback;
create trigger feedback_rate_limit_ins
  before insert on public.feedback
  for each row execute function public.feedback_rate_limit();

create or replace function public.feedback_queue()
returns table (
  id           uuid,
  created_at   timestamptz,
  kind         text,
  body         text,
  status       text,
  author_login text
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
  select f.id, f.created_at, f.kind, f.body, f.status, p.gh_login
    from public.feedback f
    left join public.profiles p on p.id = f.author_id
   order by (f.status = 'open') desc, f.created_at desc;
end;
$$;

create or replace function public.settle_feedback(entry uuid, verdict text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  if verdict not in ('open', 'done') then
    raise exception 'Unknown verdict.';
  end if;

  update public.feedback
     set status = verdict,
         handled_at = case when verdict = 'done' then now() else null end
   where id = entry;
end;
$$;

grant execute on function public.feedback_queue() to authenticated;
grant execute on function public.settle_feedback(uuid, text) to authenticated;

select 'feedback table' as step,
       case when exists (select 1 from information_schema.tables
         where table_schema='public' and table_name='feedback')
       then 'ready' else 'MISSING' end as result
union all
select 'nobody can read it but a moderator',
       case when not exists (
         select 1 from information_schema.role_table_grants
          where table_schema='public' and table_name='feedback'
            and grantee in ('anon','authenticated') and privilege_type='SELECT')
       then 'closed' else 'STILL OPEN' end
union all
select 'signed-in people can send it',
       case when exists (
         select 1 from information_schema.role_table_grants
          where table_schema='public' and table_name='feedback'
            and grantee='authenticated' and privilege_type='INSERT')
       then 'ready' else 'MISSING' end
union all
select 'moderation can read the queue',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='feedback_queue')
       then 'ready' else 'MISSING' end;
