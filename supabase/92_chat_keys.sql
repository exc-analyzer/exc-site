create table if not exists public.chat_keys (
  key uuid primary key default gen_random_uuid(),
  one uuid not null references public.profiles (id) on delete cascade,
  two uuid not null references public.profiles (id) on delete cascade,
  unique (one, two),
  check (one < two)
);

alter table public.chat_keys enable row level security;
revoke all on public.chat_keys from anon, authenticated;

create or replace function public.chat_key(other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  a uuid;
  b uuid;
  k uuid;
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;
  if me = other then
    raise exception 'That is you.';
  end if;

  if not (
    exists (select 1 from public.people_follows f
             where f.follower_id = me and f.followee_id = other)
    and exists (select 1 from public.people_follows f
                 where f.follower_id = other and f.followee_id = me)
  ) then
    raise exception 'You can only message someone who follows you back.';
  end if;

  a := least(me, other);
  b := greatest(me, other);

  select c.key into k from public.chat_keys c where c.one = a and c.two = b;
  if k is null then
    insert into public.chat_keys (one, two) values (a, b)
    on conflict (one, two) do nothing;
    select c.key into k from public.chat_keys c where c.one = a and c.two = b;
  end if;

  return k;
end;
$$;

revoke execute on function public.chat_key(uuid) from public, anon;
grant execute on function public.chat_key(uuid) to authenticated;

select 'the key table is unreachable from outside' as step,
       coalesce((select string_agg(privilege_type, ', ')
                   from information_schema.role_table_grants
                  where table_schema='public' and table_name='chat_keys'
                    and grantee in ('anon','authenticated')), 'no grants') as result
union all
select 'a key is only handed to a mutual pair',
       case when pg_get_functiondef(p.oid) like '%follows you back%'
            then 'ready' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='chat_key'
union all
select 'keys are random, not derived from ids',
       case when pg_get_expr(d.adbin, d.adrelid) like '%gen_random_uuid%'
            then 'ready' else 'GUESSABLE' end
  from pg_attrdef d
  join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
 where d.adrelid = 'public.chat_keys'::regclass and a.attname = 'key';
