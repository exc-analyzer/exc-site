alter table public.profiles
  add column if not exists verified boolean not null default false;

grant select (verified) on public.profiles to anon, authenticated;

create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  new.id            := old.id;
  new.gh_login      := old.gh_login;
  new.gh_name       := coalesce(old.gh_name, new.gh_name);
  new.gh_avatar_url := coalesce(old.gh_avatar_url, new.gh_avatar_url);
  new.gh_created_at := coalesce(old.gh_created_at, new.gh_created_at);
  new.avatar_url    := old.avatar_url;
  new.reputation    := old.reputation;
  new.created_at    := old.created_at;

  if coalesce(current_setting('app.internal', true), 'off') <> 'on' then
    new.verified := old.verified;
  end if;

  if new.name_source = 'custom' and coalesce(btrim(new.display_name), '') = '' then
    new.name_source := 'github';
  end if;

  return new;
end;
$$;

create or replace view public.member_profile
with (security_invoker = on) as
 select p.id,
    p.gh_login,
    p.avatar_url,
    p.accent,
    p.banner_style,
    p.bio,
    p.created_at,
    p.scans_public,
    p.private_account,
    public.shown_name(p.name_source, p.display_name, p.gh_name, p.gh_login) as shown_name,
    coalesce(p.replies_public, true) as replies_public,
    p.banner_height,
    p.gradient_angle,
    p.accent_two,
    p.avatar_shape,
    p.status,
    t.posts as post_count,
    t.scans as scan_count,
    t.comments as comment_count,
    t.followers as follower_count,
    t.following as following_count,
    p.verified
   from public.profiles p
     cross join lateral public.member_tally(p.id) t(posts, scans, comments, followers, following);

create or replace view public.feed
with (security_invoker = on) as
 select 'post'::text as kind,
    p.id,
    p.author_id,
    pr.gh_login as author_login,
    public.shown_name(pr.name_source, pr.display_name, pr.gh_name, pr.gh_login) as author_name,
    pr.avatar_url as author_avatar,
    pr.accent as author_accent,
    pr.accent_two as author_accent_two,
    pr.avatar_shape as author_shape,
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
    public.like_count('post'::text, p.id) as likes,
    ( select count(*) as count
           from public.comments c
          where c.post_id = p.id and c.deleted_at is null) as replies,
    pr.verified as author_verified
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
    s.accent as author_accent,
    s.accent_two as author_accent_two,
    s.shape as author_shape,
    r.author_visibility as visibility,
    null::text as body,
    r.owner,
    r.repo,
    r.kind as report_kind,
    r.score,
    r.updated_at as happened_at,
    null::timestamp with time zone as edited_at,
    null::uuid as quote_id,
    null::text as quote_body,
    null::text as quote_login,
    public.like_count('report'::text, r.id) as likes,
    ( select count(*) as count
           from public.comments c
          where c.report_id = r.id and c.deleted_at is null) as replies,
    coalesce(( select pv.verified from public.profiles pv where pv.id = s.who), false) as author_verified
   from public.reports r
     cross join lateral public.scanner_of(r.id) s(shown, who, login, name, avatar, accent, accent_two, shape)
  where r.hidden_at is null and s.shown;

create or replace function public.set_verified(login text, yes boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  handle text := lower(trim(login));
  target uuid;
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  if handle is null or handle = '' then
    raise exception 'Give the account name to mark.';
  end if;

  select p.id into target
    from public.profiles p
   where lower(p.gh_login) = handle;

  if target is null then
    raise exception 'Nobody here goes by that name.';
  end if;

  perform set_config('app.internal', 'on', true);
  update public.profiles set verified = yes where id = target;
  perform set_config('app.internal', 'off', true);
end;
$$;

create or replace function public.verified_list()
returns table(id uuid, gh_login text, shown_name text, avatar_url text, accent text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  return query
  select p.id,
         p.gh_login,
         public.shown_name(p.name_source, p.display_name, p.gh_name, p.gh_login),
         p.avatar_url,
         p.accent
    from public.profiles p
   where p.verified
   order by p.gh_login;
end;
$$;

select 'the mark exists and defaults to off' as step,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='profiles'
                            and column_name='verified' and column_default = 'false')
       then 'ready' else 'MISSING' end as result
union all
select 'everyone may read it',
       case when (select count(*) from information_schema.column_privileges
                   where table_schema='public' and table_name='profiles'
                     and column_name='verified' and privilege_type='SELECT'
                     and grantee in ('anon','authenticated')) = 2
       then 'ready' else 'MISSING' end
union all
select 'nobody may write it',
       case when not exists (select 1 from information_schema.column_privileges
                              where table_schema='public' and table_name='profiles'
                                and column_name='verified' and privilege_type='UPDATE'
                                and grantee in ('anon','authenticated'))
       then 'ready' else 'WRITABLE' end
union all
select 'the guard freezes it',
       case when pg_get_functiondef(p.oid) like '%new.verified := old.verified%'
       then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='profiles_guard'
union all
select 'both views still run as the caller',
       case when (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='public' and c.relname in ('member_profile','feed')
                     and 'security_invoker=on' = any(c.reloptions)) = 2
       then 'ready' else 'RLS BYPASSED' end
union all
select 'the mark reaches both views',
       case when (select count(*) from information_schema.columns
                   where table_schema='public'
                     and ((table_name='member_profile' and column_name='verified')
                       or (table_name='feed' and column_name='author_verified'))) = 2
       then 'ready' else 'MISSING' end
union all
select 'only a moderator may set it',
       case when pg_get_functiondef(p.oid) like '%is_moderator%'
       then 'ready' else 'OPEN' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='set_verified';
