alter table public.abuse_reports drop constraint if exists abuse_reports_target_type_check;
alter table public.abuse_reports
  add constraint abuse_reports_target_type_check
  check (target_type in ('comment', 'profile', 'report', 'post'));

alter table public.posts add column if not exists edited_at timestamptz;

create or replace function public.posts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_created timestamptz;
  recent integer;
begin
  if tg_op = 'INSERT' then
    select created_at into account_created
    from public.profiles
    where id = new.author_id;

    if account_created is null or account_created > now() - interval '24 hours' then
      raise exception 'Posting opens 24 hours after the account is created.';
    end if;

    select count(*) into recent
    from public.posts
    where author_id = new.author_id
      and created_at > now() - interval '1 hour';

    if recent >= 10 then
      raise exception 'Hourly post limit reached.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.author_id  := old.author_id;
    new.created_at := old.created_at;
    if new.body is distinct from old.body and old.deleted_at is null then
      new.edited_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

alter table public.profiles add column if not exists notifications_seen_at timestamptz not null default now();

drop view if exists public.member_profile;
create view public.member_profile
with (security_invoker = on) as
  select
    p.id,
    p.gh_login,
    p.avatar_url,
    p.accent,
    p.bio,
    p.created_at,
    case when p.name_source = 'custom' and p.display_name is not null
         then p.display_name
         else coalesce(p.gh_name, p.gh_login)
    end as shown_name,
    (select count(*) from public.posts o
      where o.author_id = p.id and o.deleted_at is null) as post_count,
    (select count(*) from public.reports r where r.created_by = p.id) as scan_count,
    (select count(*) from public.comments c
      where c.author_id = p.id and c.deleted_at is null) as comment_count
  from public.profiles p;

grant select on public.member_profile to anon, authenticated;

drop view if exists public.my_replies;
create view public.my_replies
with (security_invoker = on) as
  select
    c.id,
    c.body,
    c.created_at,
    c.author_id            as from_id,
    a.gh_login             as from_login,
    a.avatar_url           as from_avatar,
    c.post_id,
    c.report_id,
    coalesce(po.author_id, re.created_by, parent.author_id) as to_id,
    case
      when c.parent_id is not null then 'comment'
      when c.post_id is not null then 'post'
      else 'report'
    end                    as on_what,
    re.owner               as report_owner,
    re.repo                as report_repo,
    re.kind                as report_kind
  from public.comments c
  join public.profiles a on a.id = c.author_id
  left join public.posts po on po.id = c.post_id
  left join public.reports re on re.id = c.report_id
  left join public.comments parent on parent.id = c.parent_id
  where c.deleted_at is null;

grant select on public.my_replies to authenticated;

select 'abuse reports accept a post' as step,
       case when exists (select 1 from information_schema.check_constraints
         where constraint_name = 'abuse_reports_target_type_check' and check_clause like '%post%')
         then 'yes' else 'NO' end as result
union all
select 'posts remember an edit',
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'posts' and column_name = 'edited_at')
         then 'yes' else 'NO' end
union all
select 'profiles remember a last look',
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles'
           and column_name = 'notifications_seen_at')
         then 'yes' else 'NO' end
union all
select 'member profile view',
       (select count(*) from public.member_profile)::text
union all
select 'both views are caller-scoped',
       case when (select count(*) from pg_class c
         where c.relname in ('member_profile', 'my_replies')
           and c.reloptions @> array['security_invoker=on']) = 2
         then 'yes' else 'NO - they would leak' end;
