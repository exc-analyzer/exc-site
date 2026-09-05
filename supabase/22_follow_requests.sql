create table if not exists public.follow_requests (
  from_id    uuid        not null references public.profiles (id) on delete cascade,
  to_id      uuid        not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (from_id, to_id),
  constraint follow_requests_not_self check (from_id <> to_id)
);

create index if not exists follow_requests_to_idx on public.follow_requests (to_id, created_at);

alter table public.follow_requests enable row level security;

drop policy if exists "people see requests they are part of" on public.follow_requests;
create policy "people see requests they are part of"
  on public.follow_requests for select
  using ((select auth.uid()) in (from_id, to_id));

drop policy if exists "user asks to follow as themselves" on public.follow_requests;
create policy "user asks to follow as themselves"
  on public.follow_requests for insert
  with check ((select auth.uid()) = from_id);

drop policy if exists "either side clears a request" on public.follow_requests;
create policy "either side clears a request"
  on public.follow_requests for delete
  using ((select auth.uid()) in (from_id, to_id));

grant select, insert, delete on public.follow_requests to authenticated;

create or replace function public.accept_follow_request(requester uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid;
begin
  me := (select auth.uid());
  if me is null then
    raise exception 'Sign in first.';
  end if;

  delete from public.follow_requests
   where from_id = requester and to_id = me;

  if not found then
    raise exception 'There is no such request.';
  end if;

  insert into public.people_follows (follower_id, followee_id)
  values (requester, me)
  on conflict do nothing;
end;
$$;

grant execute on function public.accept_follow_request(uuid) to authenticated;

drop view if exists public.follow_request_inbox;
create view public.follow_request_inbox
with (security_invoker = on) as
  select
    r.from_id,
    r.to_id,
    r.created_at,
    p.gh_login,
    p.avatar_url,
    p.accent,
    case when p.name_source = 'custom' and p.display_name is not null
         then p.display_name
         else coalesce(p.gh_name, p.gh_login)
    end as shown_name
  from public.follow_requests r
  join public.profiles p on p.id = r.from_id;

grant select on public.follow_request_inbox to authenticated;

select 'follow_requests table' as step,
       case when exists (select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'follow_requests')
         then 'ready' else 'MISSING' end as result
union all
select 'accept function',
       case when exists (select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'accept_follow_request')
         then 'ready' else 'MISSING' end
union all
select 'inbox view',
       case when exists (select 1 from information_schema.views
         where table_schema = 'public' and table_name = 'follow_request_inbox')
         then 'ready' else 'MISSING' end;
