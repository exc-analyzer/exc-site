create or replace view public.report_card
with (security_invoker = on) as
  select r.id, r.owner, r.repo, r.kind, r.score, r.summary, r.scan_count,
         r.created_at, r.updated_at, r.author_visibility,
         r.disputed_at, r.disputed_note,
         s.login as scanner_login,
         s.avatar as scanner_avatar
    from public.reports r
    cross join lateral public.scanner_of(r.id) s
   where r.hidden_at is null;

drop view if exists public.feed;

create view public.feed
with (security_invoker = on) as
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
  union all
  select 'report'::text as kind,
         r.id,
         s.who, s.login, s.name, s.avatar,
         r.author_visibility,
         null::text, r.owner, r.repo, r.kind, r.score,
         r.updated_at, null::timestamptz,
         null::uuid, null::text, null::text,
         public.like_count('report', r.id),
         (select count(*) from public.comments c
           where c.report_id = r.id and c.deleted_at is null)
    from public.reports r
    cross join lateral public.scanner_of(r.id) s
   where r.hidden_at is null and s.shown;

grant select on public.feed, public.report_card to anon, authenticated;
revoke truncate, references, trigger on public.feed, public.report_card from anon, authenticated;

select 'a taken-down scan is filtered by the view too' as step,
       case when (select count(*) from pg_views
                   where schemaname='public' and viewname in ('feed','report_card')
                     and definition like '%hidden_at%') = 2
       then 'ready' else 'MISSING' end as result
union all
select 'still invoker views',
       coalesce((select string_agg(c.relname, ', ') from pg_class c
                  join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public' and c.relkind='v'
                   and not ('security_invoker=on' = any(coalesce(c.reloptions,'{}')))), 'all invoker');
