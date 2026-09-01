do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('public', 'profiles', 'profiller herkese acik okunur', 'profiles are publicly readable'),
      ('public', 'profiles', 'kullanici kendi profilini olusturur', 'user creates own profile'),
      ('public', 'profiles', 'kullanici kendi profilini gunceller', 'user updates own profile'),
      ('public', 'reports', 'raporlar herkese acik okunur', 'reports are publicly readable'),
      ('public', 'reports', 'giris yapmis kullanici rapor yazar', 'signed in user writes a report'),
      ('public', 'reports', 'giris yapmis kullanici rapor tazeler', 'signed in user refreshes a report'),
      ('public', 'comments', 'yorumlar herkese acik okunur', 'comments are publicly readable'),
      ('public', 'comments', 'kullanici kendi adina yorum yazar', 'user comments as themselves'),
      ('public', 'comments', 'kullanici kendi yorumunu duzenler', 'user edits own comment'),
      ('public', 'votes', 'kullanici kendi oyunu gorur', 'user sees own vote'),
      ('public', 'votes', 'kullanici kendi adina oy verir', 'user votes as themselves'),
      ('public', 'votes', 'kullanici oyunu degistirir', 'user changes own vote'),
      ('public', 'votes', 'kullanici oyunu geri alir', 'user withdraws own vote'),
      ('public', 'abuse_reports', 'bildiren kendi kaydini gorur', 'reporter sees own filing'),
      ('public', 'abuse_reports', 'kullanici bildirim olusturur', 'user files an abuse report')
    ) as t(sch, tbl, old_name, new_name)
  loop
    if exists (
      select 1 from pg_policies
       where schemaname = r.sch and tablename = r.tbl and policyname = r.old_name
    ) then
      execute format('alter policy %I on %I.%I rename to %I', r.old_name, r.sch, r.tbl, r.new_name);
    end if;
  end loop;
end $$;

delete from public.reports;

create or replace function public.reports_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  select count(*) into recent
  from public.reports
  where created_by = (select auth.uid())
    and updated_at > now() - interval '1 hour';

  if recent >= 120 then
    raise exception 'Hourly report limit reached. Try again a little later.';
  end if;

  if tg_op = 'UPDATE' then
    new.scan_count := old.scan_count + 1;
    new.created_at := old.created_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.comments_guard()
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
      raise exception 'Comments open 24 hours after the account is created.';
    end if;

    select count(*) into recent
    from public.comments
    where author_id = new.author_id
      and created_at > now() - interval '1 hour';

    if recent >= 20 then
      raise exception 'Hourly comment limit reached.';
    end if;
  end if;

  if tg_op = 'UPDATE' then

    new.author_id  := old.author_id;
    new.report_id  := old.report_id;
    new.parent_id  := old.parent_id;
    new.created_at := old.created_at;
    new.vote_score := old.vote_score;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, gh_login, avatar_url, gh_avatar_url, gh_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'user_name',
      new.raw_user_meta_data ->> 'preferred_username',
      'user-' || left(new.id::text, 8)
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

select 'policies renamed' as step,
       (select count(*) from pg_policies
         where schemaname = 'public'
           and policyname ~ '^(kullanici|giris|profiller|raporlar|yorumlar|bildiren)') as leftover
union all
select 'reports cleared',
       (select count(*) from public.reports);
