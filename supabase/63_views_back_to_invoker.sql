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
         s.who as author_id,
         s.login as author_login,
         s.name as author_name,
         s.avatar as author_avatar,
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
    cross join lateral public.scanner_of(r.id) s
   where s.shown;

drop view if exists public.report_card;

create view public.report_card
with (security_invoker = on) as
  select r.id, r.owner, r.repo, r.kind, r.score, r.summary, r.scan_count,
         r.created_at, r.updated_at, r.author_visibility,
         r.disputed_at, r.disputed_note,
         s.login as scanner_login,
         s.avatar as scanner_avatar
    from public.reports r
    cross join lateral public.scanner_of(r.id) s;

drop view if exists public.member_profile;

create view public.member_profile
with (security_invoker = on) as
  select p.id, p.gh_login, p.avatar_url, p.accent, p.banner_style, p.bio,
         p.created_at, p.scans_public, p.private_account,
         public.shown_name(p.name_source, p.display_name, p.gh_name, p.gh_login) as shown_name,
         t.posts     as post_count,
         t.scans     as scan_count,
         t.comments  as comment_count,
         t.followers as follower_count,
         t.following as following_count
    from public.profiles p
    cross join lateral public.member_tally(p.id) t;

grant select on public.feed, public.report_card, public.member_profile to anon, authenticated;
revoke truncate, references, trigger on public.feed, public.report_card, public.member_profile
  from anon, authenticated;

select 'no view runs as its creator any more' as step,
       coalesce((
         select string_agg(c.relname, ', ')
           from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relkind='v'
            and not ('security_invoker=on' = any(coalesce(c.reloptions, '{}')))
       ), 'none') as result
union all
select 'row filtering now comes from RLS',
       case when (select qual::text from pg_policies
                   where schemaname='public' and tablename='reports' and cmd='SELECT')
                 like '%hidden_at%' then 'ready' else 'MISSING' end;
