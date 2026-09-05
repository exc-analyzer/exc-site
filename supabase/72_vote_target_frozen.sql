revoke update on public.votes from authenticated;
grant update (value) on public.votes to authenticated;

create or replace function public.votes_stay_put()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.target_type := old.target_type;
  new.target_id   := old.target_id;
  new.user_id     := old.user_id;
  return new;
end;
$$;

drop trigger if exists votes_stay_put_upd on public.votes;
create trigger votes_stay_put_upd
  before update on public.votes
  for each row execute function public.votes_stay_put();

select 'a vote cannot be moved to another comment' as step,
       case when exists (select 1 from pg_trigger where tgname='votes_stay_put_upd' and not tgisinternal)
       then 'ready' else 'MISSING' end as result
union all
select 'nor rewritten to point at someone else',
       case when not exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='votes'
            and column_name in ('target_id','target_type','user_id')
            and grantee='authenticated' and privilege_type='UPDATE')
       then 'closed' else 'STILL OPEN' end
union all
select 'withdrawing and recasting still work',
       case when exists (
         select 1 from information_schema.column_privileges
          where table_schema='public' and table_name='votes'
            and column_name='value' and grantee='authenticated' and privilege_type='UPDATE')
       then 'ready' else 'BROKEN' end;
