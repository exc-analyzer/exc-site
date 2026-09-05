create or replace function public.hourly_cap(
  who uuid,
  kind text,
  made integer,
  cap integer
)
returns void
language plpgsql
immutable
as $$
begin
  if made >= cap then
    raise exception 'That is a lot of % in one hour. Try again a bit later.', kind;
  end if;
end;
$$;

revoke execute on function public.hourly_cap(uuid, text, integer, integer) from public;

create or replace function public.abuse_reports_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  if exists (
    select 1 from public.abuse_reports a
     where a.reporter_id = new.reporter_id
       and a.target_type = new.target_type
       and a.target_id = new.target_id
  ) then
    raise exception 'You have already reported this one. We have it.';
  end if;

  select count(*) into recent
    from public.abuse_reports a
   where a.reporter_id = new.reporter_id
     and a.created_at > now() - interval '1 hour';

  if recent >= 10 then
    raise exception 'That is a lot of reports in one hour. Try again a bit later.';
  end if;

  return new;
end;
$$;

drop trigger if exists abuse_reports_rate_limit_ins on public.abuse_reports;
create trigger abuse_reports_rate_limit_ins
  before insert on public.abuse_reports
  for each row execute function public.abuse_reports_rate_limit();

create or replace function public.follows_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  select count(*) into recent
    from public.follows f
   where f.user_id = new.user_id
     and f.created_at > now() - interval '1 hour';

  if recent >= 60 then
    raise exception 'That is a lot of repositories in one hour. Try again a bit later.';
  end if;

  return new;
end;
$$;

drop trigger if exists follows_rate_limit_ins on public.follows;
create trigger follows_rate_limit_ins
  before insert on public.follows
  for each row execute function public.follows_rate_limit();

create or replace function public.people_follows_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  select count(*) into recent
    from public.people_follows p
   where p.follower_id = new.follower_id
     and p.created_at > now() - interval '1 hour';

  if recent >= 60 then
    raise exception 'That is a lot of people in one hour. Try again a bit later.';
  end if;

  return new;
end;
$$;

drop trigger if exists people_follows_rate_limit_ins on public.people_follows;
create trigger people_follows_rate_limit_ins
  before insert on public.people_follows
  for each row execute function public.people_follows_rate_limit();

create or replace function public.votes_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  select count(*) into recent
    from public.votes v
   where v.user_id = new.user_id
     and v.created_at > now() - interval '1 hour';

  if recent >= 200 then
    raise exception 'That is a lot of votes in one hour. Try again a bit later.';
  end if;

  return new;
end;
$$;

drop trigger if exists votes_rate_limit_ins on public.votes;
create trigger votes_rate_limit_ins
  before insert on public.votes
  for each row execute function public.votes_rate_limit();

select 'reporting the same thing twice' as step,
       case when exists (select 1 from pg_trigger where tgname='abuse_reports_rate_limit_ins' and not tgisinternal)
       then 'blocked' else 'MISSING' end as result
union all
select 'mass following repositories',
       case when exists (select 1 from pg_trigger where tgname='follows_rate_limit_ins' and not tgisinternal)
       then 'capped' else 'MISSING' end
union all
select 'mass following people',
       case when exists (select 1 from pg_trigger where tgname='people_follows_rate_limit_ins' and not tgisinternal)
       then 'capped' else 'MISSING' end
union all
select 'vote flooding',
       case when exists (select 1 from pg_trigger where tgname='votes_rate_limit_ins' and not tgisinternal)
       then 'capped' else 'MISSING' end;
