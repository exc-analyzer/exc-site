create or replace function public.shown_name(
  name_source text,
  display_name text,
  gh_name text,
  gh_login text
)
returns text
language sql
immutable
as $$
  select case
    when name_source = 'custom' and nullif(btrim(display_name), '') is not null
      then btrim(display_name)
    else coalesce(nullif(btrim(gh_name), ''), gh_login)
  end;
$$;

revoke execute on function public.shown_name(text, text, text, text) from public;
grant execute on function public.shown_name(text, text, text, text) to anon, authenticated;

drop view if exists public.feed;

create view public.feed
with (security_invoker = off) as
  select 'post'::text as kind,
         p.id,
         p.author_id,
         pr.gh_login as author_login,
         public.shown_name(pr.name_source, pr.display_name, pr.gh_name, pr.gh_login) as author_name,
         pr.avatar_url as author_avatar,
         null::text as visibility,
         p.body,
         p.repo_owner as owner,
         p.repo_name as repo,
         null::text as report_kind,
         null::integer as score,
         p.created_at as happened_at,
         p.edited_at,
         p.quote_of as quote_id,
         q.body as quote_body,
         qa.gh_login as quote_login,
         public.like_count('post', p.id) as likes,
         (select count(*) from public.comments c
           where c.post_id = p.id and c.deleted_at is null) as replies
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
    left join public.posts q on q.id = p.quote_of and q.deleted_at is null
    left join public.profiles qa on qa.id = q.author_id
   where p.deleted_at is null
     and (not pr.private_account or public.sees_private(pr.id))
  union all
  select 'report'::text as kind,
         r.id,
         case when public.scan_author_shown(r.author_visibility,
                pr.scans_public and (not pr.private_account or public.sees_private(pr.id)),
                r.created_by) then r.created_by end as author_id,
         case when public.scan_author_shown(r.author_visibility,
                pr.scans_public and (not pr.private_account or public.sees_private(pr.id)),
                r.created_by) then pr.gh_login end as author_login,
         case when public.scan_author_shown(r.author_visibility,
                pr.scans_public and (not pr.private_account or public.sees_private(pr.id)),
                r.created_by)
              then public.shown_name(pr.name_source, pr.display_name, pr.gh_name, pr.gh_login)
         end as author_name,
         case when public.scan_author_shown(r.author_visibility,
                pr.scans_public and (not pr.private_account or public.sees_private(pr.id)),
                r.created_by) then pr.avatar_url end as author_avatar,
         r.author_visibility as visibility,
         null::text as body,
         r.owner,
         r.repo,
         r.kind as report_kind,
         r.score,
         r.updated_at as happened_at,
         null::timestamptz as edited_at,
         null::uuid as quote_id,
         null::text as quote_body,
         null::text as quote_login,
         public.like_count('report', r.id) as likes,
         (select count(*) from public.comments c
           where c.report_id = r.id and c.deleted_at is null) as replies
    from public.reports r
    left join public.profiles pr on pr.id = r.created_by
   where r.hidden_at is null
     and public.scan_author_shown(r.author_visibility,
           pr.scans_public and (not pr.private_account or public.sees_private(pr.id)),
           r.created_by);

grant select on public.feed to anon, authenticated;
revoke truncate, references, trigger on public.feed from anon, authenticated;

select 'the feed carries a display name' as step,
       case when exists (select 1 from information_schema.columns
         where table_schema='public' and table_name='feed' and column_name='author_name')
       then 'ready' else 'MISSING' end as result
union all
select 'a hidden scanner stays hidden',
       case when (select definition from pg_views where schemaname='public' and viewname='feed')
                 like '%scan_author_shown%' then 'ready' else 'MISSING' end
union all
select 'still a definer view',
       case when exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relname='feed'
           and not ('security_invoker=on' = any(c.reloptions)))
       then 'ready' else 'MISSING' end;
