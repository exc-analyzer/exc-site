do $$
declare
  v record;
begin
  for v in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format(
      'revoke truncate, references, trigger on public.%I from anon, authenticated',
      v.relname
    );
  end loop;
end;
$$;

select 'nothing carries truncate any more' as step,
       coalesce((
         select string_agg(distinct table_name, ', ')
           from information_schema.role_table_grants
          where table_schema='public' and grantee in ('anon','authenticated')
            and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')
       ), 'clean') as result;
