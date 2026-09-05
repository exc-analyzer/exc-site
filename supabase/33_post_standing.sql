create or replace function public.post_standing(post uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.posts p where p.id = post)
      then 'missing'
    when exists (select 1 from public.posts p where p.id = post and p.deleted_at is not null)
      then 'deleted'
    when exists (
      select 1
        from public.posts p
        join public.profiles pr on pr.id = p.author_id
       where p.id = post
         and pr.private_account
         and not public.sees_private(pr.id)
    ) then 'private'
    else 'open'
  end;
$$;

grant execute on function public.post_standing(uuid) to anon, authenticated;

select 'post standing' as step,
       case when exists (select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='post_standing')
         then 'ready' else 'MISSING' end as result;
