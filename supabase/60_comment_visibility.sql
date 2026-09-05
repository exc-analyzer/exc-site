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
      select 1 from public.posts p where p.id = post and p.deleted_at is null
    ));
$$;

revoke execute on function public.thread_is_open(uuid, uuid) from public;
grant execute on function public.thread_is_open(uuid, uuid) to anon, authenticated;

drop policy if exists "comments follow the thing they hang on" on public.comments;
create policy "comments follow the thing they hang on"
  on public.comments for select
  using (
    author_id = (select auth.uid())
    or public.thread_is_open(report_id, post_id)
  );

select 'comments are readable again' as step,
       case when exists (select 1 from pg_policies
         where schemaname='public' and tablename='comments' and cmd='SELECT'
           and qual::text like '%thread_is_open%')
       then 'ready' else 'MISSING' end as result;
