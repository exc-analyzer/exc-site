create or replace view public.my_replies
with (security_invoker = on) as
 select c.id,
    c.body,
    c.created_at,
    c.author_id as from_id,
    a.gh_login as from_login,
    a.avatar_url as from_avatar,
    c.post_id,
    c.report_id,
    coalesce(
      parent.author_id,
      po.author_id,
      case when re.id is not null and public.i_scanned(re.id)
           then (select auth.uid()) end
    ) as to_id,
    case
      when c.parent_id is not null then 'comment'::text
      when c.post_id is not null then 'post'::text
      else 'report'::text
    end as on_what,
    re.owner as report_owner,
    re.repo as report_repo,
    re.kind as report_kind
   from public.comments c
     join public.profiles a on a.id = c.author_id
     left join public.posts po on po.id = c.post_id
     left join public.profiles poa on poa.id = po.author_id
     left join public.reports re on re.id = c.report_id
     left join public.comments parent on parent.id = c.parent_id
  where c.deleted_at is null
    and (po.id is null
      or po.deleted_at is not null
      or not poa.private_account
      or public.sees_private(poa.id)
      or c.author_id = (select auth.uid()));

select 'a reply now reaches the person it answers' as step,
       case when pg_get_viewdef('public.my_replies'::regclass, true)
                 ~ 'coalesce\(\s*parent\.author_id'
       then 'ready' else 'MISSING' end as result
union all
select 'the view still runs as the caller',
       case when 'security_invoker=on' = any(c.reloptions) then 'ready' else 'RLS BYPASSED' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'my_replies';
