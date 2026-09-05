create or replace function public.people_follows_respect_privacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  guarded boolean;
  actor   uuid := (select auth.uid());
begin
  select coalesce(private_account, false) into guarded
    from public.profiles where id = new.followee_id;

  if guarded and (actor is null or actor <> new.followee_id) then
    raise exception 'This account approves its followers. Send a request instead.';
  end if;

  return new;
end;
$$;

select 'a private account cannot be followed unasked' as step,
       case when pg_get_functiondef(p.oid) like '%actor is null%'
            then 'ready' else 'MISSING' end as result
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='people_follows_respect_privacy';
