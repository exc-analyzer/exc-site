create table if not exists public.mentions (
  id         uuid        primary key default gen_random_uuid(),
  from_id    uuid        not null references public.profiles (id) on delete cascade,
  to_id      uuid        not null references public.profiles (id) on delete cascade,
  post_id    uuid        references public.posts (id) on delete cascade,
  comment_id uuid        references public.comments (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint mentions_one_source check (num_nonnulls(post_id, comment_id) = 1),
  constraint mentions_not_self check (from_id <> to_id)
);

create index if not exists mentions_to_idx on public.mentions (to_id, created_at desc);
create unique index if not exists mentions_post_unique
  on public.mentions (to_id, post_id) where post_id is not null;
create unique index if not exists mentions_comment_unique
  on public.mentions (to_id, comment_id) where comment_id is not null;

alter table public.mentions enable row level security;

drop policy if exists "user sees mentions of themselves" on public.mentions;
create policy "user sees mentions of themselves"
  on public.mentions for select
  using ((select auth.uid()) = to_id);

grant select on public.mentions to authenticated;

create or replace function public.record_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  handle text;
  target uuid;
  author uuid;
begin
  author := new.author_id;

  for handle in
    select distinct lower(m[1])
      from regexp_matches(new.body, '@([A-Za-z0-9][A-Za-z0-9-]{0,38})', 'g') as m
  loop
    select p.id into target
      from public.profiles p
     where lower(p.gh_login) = handle
     limit 1;

    if target is not null and target <> author then
      if tg_table_name = 'posts' then
        insert into public.mentions (from_id, to_id, post_id)
        values (author, target, new.id)
        on conflict do nothing;
      else
        insert into public.mentions (from_id, to_id, comment_id)
        values (author, target, new.id)
        on conflict do nothing;
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists posts_record_mentions on public.posts;
create trigger posts_record_mentions
  after insert on public.posts
  for each row execute function public.record_mentions();

drop trigger if exists comments_record_mentions on public.comments;
create trigger comments_record_mentions
  after insert on public.comments
  for each row execute function public.record_mentions();

drop view if exists public.my_mentions;
create view public.my_mentions
with (security_invoker = on) as
  select
    m.id,
    m.created_at,
    m.to_id,
    m.from_id,
    a.gh_login    as from_login,
    a.avatar_url  as from_avatar,
    m.post_id,
    m.comment_id,
    coalesce(p.body, c.body) as body,
    c.report_id,
    c.post_id     as comment_post_id,
    r.owner       as report_owner,
    r.repo        as report_repo,
    r.kind        as report_kind
  from public.mentions m
  join public.profiles a on a.id = m.from_id
  left join public.posts p on p.id = m.post_id and p.deleted_at is null
  left join public.comments c on c.id = m.comment_id and c.deleted_at is null
  left join public.reports r on r.id = c.report_id
  where coalesce(p.id, c.id) is not null;

grant select on public.my_mentions to authenticated;

select 'mentions table' as step,
       case when exists (select 1 from information_schema.tables
         where table_schema='public' and table_name='mentions')
         then 'ready' else 'MISSING' end as result
union all
select 'mentions stay private',
       case when has_table_privilege('anon', 'public.mentions', 'SELECT')
            then 'NO - anon can read them' else 'yes' end
union all
select 'members cannot write mentions',
       case when has_table_privilege('authenticated', 'public.mentions', 'INSERT')
            then 'NO - members can forge them' else 'yes' end
union all
select 'view is caller-scoped',
       case when exists (select 1 from pg_class c
         where c.relname = 'my_mentions' and c.reloptions @> array['security_invoker=on'])
         then 'yes' else 'NO - it would leak' end;
