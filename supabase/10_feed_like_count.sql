create or replace function public.like_count(p_type text, p_id uuid)
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)::integer
    from public.votes
   where target_type = p_type
     and target_id = p_id
     and value = 1;
$$;

revoke all on function public.like_count(text, uuid) from public;
grant execute on function public.like_count(text, uuid) to anon, authenticated;

grant select, insert, update, delete on public.votes to authenticated;

drop view if exists public.feed;
create view public.feed
with (security_invoker = on) as
  select
    'post'::text        as kind,
    p.id                as id,
    p.author_id         as author_id,
    pr.gh_login         as author_login,
    pr.avatar_url       as author_avatar,
    p.body              as body,
    p.repo_owner        as owner,
    p.repo_name         as repo,
    null::text          as report_kind,
    null::integer       as score,
    p.created_at        as happened_at,
    public.like_count('post', p.id) as likes,
    (select count(*) from public.comments c
      where c.post_id = p.id and c.deleted_at is null) as replies
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p.deleted_at is null

  union all

  select
    'report'::text,
    r.id,
    r.created_by,
    pr.gh_login,
    pr.avatar_url,
    null::text,
    r.owner,
    r.repo,
    r.kind,
    r.score,
    r.updated_at,
    public.like_count('report', r.id),
    (select count(*) from public.comments c
      where c.report_id = r.id and c.deleted_at is null)
  from public.reports r
  left join public.profiles pr on pr.id = r.created_by;

grant select on public.feed to anon, authenticated;

select 'feed readable' as step,
       (select count(*) from public.feed)::text as result
union all
select 'votes still private to others',
       case when has_table_privilege('anon', 'public.votes', 'SELECT')
            then 'NO - anon can read votes' else 'yes' end
union all
select 'feed view is caller-scoped',
       case when exists (select 1 from pg_class c
         where c.relname = 'feed' and c.reloptions @> array['security_invoker=on'])
         then 'yes' else 'NO - it would leak' end;
