alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

create or replace function public.accept_terms(version text default '2026-09-03')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.';
  end if;

  update public.profiles
     set terms_accepted_at = coalesce(terms_accepted_at, now()),
         terms_version     = version
   where id = (select auth.uid());
end;
$$;

grant execute on function public.accept_terms(text) to authenticated;

create or replace function public.my_terms_state()
returns table (accepted_at timestamptz, version text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.terms_accepted_at, p.terms_version
    from public.profiles p
   where p.id = (select auth.uid());
$$;

grant execute on function public.my_terms_state() to authenticated;

select 'consent columns' as step,
       case when exists (select 1 from information_schema.columns
         where table_schema='public' and table_name='profiles'
           and column_name='terms_accepted_at')
       then 'ready' else 'MISSING' end as result
union all
select 'recording consent',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='accept_terms')
       then 'ready' else 'MISSING' end
union all
select 'reading my own consent',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='my_terms_state')
       then 'ready' else 'MISSING' end;
