alter table public.reports
  add column if not exists disputed_at timestamptz,
  add column if not exists disputed_note text;

create or replace function public.mark_disputed(report_id uuid, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  update public.reports
     set disputed_at = now(), disputed_note = note
   where id = report_id;

  if not found then
    raise exception 'No such report.';
  end if;
end;
$$;

grant execute on function public.mark_disputed(uuid, text) to authenticated;

create or replace function public.clear_dispute(report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'No such page.';
  end if;

  update public.reports
     set disputed_at = null, disputed_note = null
   where id = report_id;
end;
$$;

grant execute on function public.clear_dispute(uuid) to authenticated;

drop view if exists public.explore;
create view public.explore
with (security_invoker = on) as
  select
    r.owner,
    r.repo,
    r.kind,
    r.score,
    r.scan_count,
    r.updated_at,
    (select h.score from public.report_scores h
      where h.report_id = r.id order by h.recorded_at asc limit 1) as first_score,
    r.score - (select h.score from public.report_scores h
      where h.report_id = r.id order by h.recorded_at asc limit 1) as improvement,
    (select count(*) from public.comments c
      where c.report_id = r.id and c.deleted_at is null) as replies,
    public.like_count('report', r.id) as likes
  from public.reports r
  where r.repo <> ''
    and r.hidden_at is null
    and r.updated_at > now() - interval '90 days'
    and r.disputed_at is null;

grant select on public.explore to anon, authenticated;

drop view if exists public.report_card;
create view public.report_card
with (security_invoker = on) as
  select
    r.id,
    r.owner,
    r.repo,
    r.kind,
    r.score,
    r.summary,
    r.scan_count,
    r.created_at,
    r.updated_at,
    r.author_visibility,
    r.disputed_at,
    r.disputed_note,
    case when public.scan_author_shown(
           r.author_visibility,
           pr.scans_public and (not pr.private_account or public.sees_private(pr.id)),
           r.created_by)
         then pr.gh_login end as scanner_login,
    case when public.scan_author_shown(
           r.author_visibility,
           pr.scans_public and (not pr.private_account or public.sees_private(pr.id)),
           r.created_by)
         then pr.avatar_url end as scanner_avatar
  from public.reports r
  left join public.profiles pr on pr.id = r.created_by
  where r.hidden_at is null;

grant select on public.report_card to anon, authenticated;

select 'dispute column' as step,
       case when exists (select 1 from information_schema.columns
         where table_schema='public' and table_name='reports' and column_name='disputed_at')
         then 'ready' else 'MISSING' end as result
union all
select 'boards drop disputed results',
       case when exists (select 1 from pg_views where schemaname='public'
         and viewname='explore' and definition like '%disputed_at%')
         then 'ready' else 'MISSING' end
union all
select 'report page can show the dispute',
       case when exists (select 1 from information_schema.columns
         where table_schema='public' and table_name='report_card' and column_name='disputed_at')
         then 'ready' else 'MISSING' end;
