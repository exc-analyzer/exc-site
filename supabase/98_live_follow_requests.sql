create or replace function public.follow_request_ping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.nudge(new.to_id);
  return null;
end;
$$;

drop trigger if exists follow_requests_ping_ins on public.follow_requests;
create trigger follow_requests_ping_ins
  after insert on public.follow_requests
  for each row execute function public.follow_request_ping();

create or replace function public.follows_ping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.nudge(new.followee_id);
  return null;
end;
$$;

drop trigger if exists people_follows_ping_ins on public.people_follows;
create trigger people_follows_ping_ins
  after insert on public.people_follows
  for each row execute function public.follows_ping();

select 'a follow request wakes the other side' as step,
       case when exists (select 1 from pg_trigger
              where tgrelid = 'public.follow_requests'::regclass
                and tgname = 'follow_requests_ping_ins')
       then 'ready' else 'MISSING' end as result
union all
select 'so does a new follower',
       case when exists (select 1 from pg_trigger
              where tgrelid = 'public.people_follows'::regclass
                and tgname = 'people_follows_ping_ins')
       then 'ready' else 'MISSING' end
union all
select 'the ping still names nobody',
       case when not exists (
         select 1 from information_schema.columns
          where table_schema='public' and table_name='mail_pings'
            and column_name not in ('key','at','seq'))
       then 'ready' else 'LEAKS' end;
