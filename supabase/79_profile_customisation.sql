alter table public.profiles
  add column if not exists banner_height   text not null default 'normal',
  add column if not exists gradient_angle  text not null default 'diagonal',
  add column if not exists accent_two      text,
  add column if not exists avatar_shape    text not null default 'circle',
  add column if not exists avatar_ring     text not null default 'accent',
  add column if not exists status          text;

alter table public.profiles drop constraint if exists profiles_banner_height_check;
alter table public.profiles add constraint profiles_banner_height_check
  check (banner_height in ('slim', 'normal', 'tall'));

alter table public.profiles drop constraint if exists profiles_gradient_angle_check;
alter table public.profiles add constraint profiles_gradient_angle_check
  check (gradient_angle in ('horizontal', 'vertical', 'diagonal'));

alter table public.profiles drop constraint if exists profiles_accent_two_check;
alter table public.profiles add constraint profiles_accent_two_check
  check (accent_two is null or accent_two in
    ('indigo','violet','fuchsia','pink','sky','cyan','teal','emerald','slate'));

alter table public.profiles drop constraint if exists profiles_avatar_shape_check;
alter table public.profiles add constraint profiles_avatar_shape_check
  check (avatar_shape in ('circle', 'rounded', 'hex'));

alter table public.profiles drop constraint if exists profiles_avatar_ring_check;
alter table public.profiles add constraint profiles_avatar_ring_check
  check (avatar_ring in ('none', 'accent', 'gradient', 'double'));

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status is null or status in
    ('open-to-contributors','reviewing','building','learning','busy','away'));

alter table public.profiles drop constraint if exists profiles_banner_style_check;
alter table public.profiles add constraint profiles_banner_style_check
  check (banner_style in ('glow', 'mesh', 'beam', 'grid', 'wave', 'noise'));

grant select (banner_height, gradient_angle, accent_two, avatar_shape, avatar_ring, status)
  on public.profiles to anon, authenticated;
grant update (banner_height, gradient_angle, accent_two, avatar_shape, avatar_ring, status)
  on public.profiles to authenticated;

select 'the six new settings exist' as step,
       case when (select count(*) from information_schema.columns
         where table_schema='public' and table_name='profiles'
           and column_name in ('banner_height','gradient_angle','accent_two',
                               'avatar_shape','avatar_ring','status')) = 6
       then 'ready' else 'MISSING' end as result
union all
select 'each one only accepts known values',
       case when (select count(*) from pg_constraint
         where conrelid='public.profiles'::regclass and contype='c'
           and conname in ('profiles_banner_height_check','profiles_gradient_angle_check',
                           'profiles_accent_two_check','profiles_avatar_shape_check',
                           'profiles_avatar_ring_check','profiles_status_check')) = 6
       then 'ready' else 'MISSING' end
union all
select 'two more banner patterns allowed',
       case when pg_get_constraintdef(oid) like '%wave%'
            then 'ready' else 'MISSING' end
  from pg_constraint
 where conrelid='public.profiles'::regclass and conname='profiles_banner_style_check'
union all
select 'a person can change them',
       case when (select count(*) from information_schema.column_privileges
         where table_schema='public' and table_name='profiles' and grantee='authenticated'
           and privilege_type='UPDATE'
           and column_name in ('banner_height','gradient_angle','accent_two',
                               'avatar_shape','avatar_ring','status')) = 6
       then 'ready' else 'MISSING' end;
