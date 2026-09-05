create table if not exists public.pinned_repos (
  owner_id   uuid        not null references public.profiles (id) on delete cascade,
  owner      text        not null,
  repo       text        not null,
  note       text,
  position   smallint    not null default 0,
  created_at timestamptz not null default now(),

  primary key (owner_id, owner, repo),
  constraint pinned_repos_owner_shape check (owner ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$'),
  constraint pinned_repos_repo_shape check (repo ~ '^[A-Za-z0-9._-]{1,100}$'),
  constraint pinned_repos_note_length check (note is null or char_length(note) <= 80)
);

create index if not exists pinned_repos_owner_idx on public.pinned_repos (owner_id, position);

create or replace function public.pinned_repos_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.pinned_repos where owner_id = new.owner_id) >= 3 then
    raise exception 'You can pin at most three repositories.';
  end if;
  return new;
end;
$$;

drop trigger if exists pinned_repos_limit_trigger on public.pinned_repos;
create trigger pinned_repos_limit_trigger
  before insert on public.pinned_repos
  for each row execute function public.pinned_repos_limit();

alter table public.pinned_repos enable row level security;

drop policy if exists "pins are publicly readable" on public.pinned_repos;
create policy "pins are publicly readable"
  on public.pinned_repos for select
  using (true);

drop policy if exists "user pins as themselves" on public.pinned_repos;
create policy "user pins as themselves"
  on public.pinned_repos for insert
  with check ((select auth.uid()) = owner_id);

drop policy if exists "user edits own pins" on public.pinned_repos;
create policy "user edits own pins"
  on public.pinned_repos for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "user removes own pins" on public.pinned_repos;
create policy "user removes own pins"
  on public.pinned_repos for delete
  using ((select auth.uid()) = owner_id);

grant select on public.pinned_repos to anon, authenticated;
grant insert, update, delete on public.pinned_repos to authenticated;

update public.profiles set accent = 'indigo' where accent = 'amber';

alter table public.profiles
  drop constraint if exists profiles_accent_check;

alter table public.profiles
  add constraint profiles_accent_check
  check (accent in ('indigo', 'violet', 'pink', 'emerald', 'sky'));

select 'pinned repos' as step,
       case when exists (select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'pinned_repos')
         then 'ready' else 'MISSING' end as result
union all
select 'sky accent allowed',
       case when exists (
         select 1 from information_schema.check_constraints
          where constraint_schema = 'public'
            and constraint_name = 'profiles_accent_check'
            and check_clause like '%sky%'
       ) then 'ready' else 'MISSING' end
union all
select 'no amber left',
       case when not exists (select 1 from public.profiles where accent = 'amber')
         then 'clean' else 'STILL THERE' end;
