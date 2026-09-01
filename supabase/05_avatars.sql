insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  512000,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "images are publicly readable" on storage.objects;
create policy "images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "user uploads own image" on storage.objects;
create policy "user uploads own image"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '.webp'
  );

drop policy if exists "user replaces own image" on storage.objects;
create policy "user replaces own image"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '.webp'
  );

drop policy if exists "user deletes own image" on storage.objects;
create policy "user deletes own image"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '.webp'
  );

create table if not exists public.abuse_reports (
  id           uuid        primary key default gen_random_uuid(),
  target_type  text        not null check (target_type in ('avatar', 'comment', 'profile', 'report')),
  target_id    uuid        not null,
  reporter_id  uuid        not null references public.profiles (id) on delete cascade,
  reason       text        not null check (char_length(btrim(reason)) between 3 and 500),
  status       text        not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at   timestamptz not null default now(),

  unique (target_type, target_id, reporter_id)
);

create index if not exists abuse_open_idx on public.abuse_reports (status, created_at desc);

alter table public.abuse_reports enable row level security;

drop policy if exists "reporter sees own filing" on public.abuse_reports;
create policy "reporter sees own filing"
  on public.abuse_reports for select
  using ((select auth.uid()) = reporter_id);

drop policy if exists "user files an abuse report" on public.abuse_reports;
create policy "user files an abuse report"
  on public.abuse_reports for insert
  with check ((select auth.uid()) = reporter_id);

grant select, insert on public.abuse_reports to authenticated;

create or replace function public.reset_avatar(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
     set avatar_source = 'github',
         custom_avatar_url = null
   where id = target;
$$;

revoke all on function public.reset_avatar(uuid) from public, anon, authenticated;
