alter table public.chat_themes
  drop constraint if exists chat_themes_theme_check;

alter table public.chat_themes
  add constraint chat_themes_theme_check
  check (theme in (
    'plain', 'love', 'game', 'money', 'forest', 'sunset', 'ocean', 'mono', 'paper'
  ));

select 'the allowed list grew' as step,
       case when pg_get_constraintdef(c.oid) like '%money%'
             and pg_get_constraintdef(c.oid) like '%paper%'
       then 'ready' else 'MISSING' end as result
  from pg_constraint c
 where c.conrelid = 'public.chat_themes'::regclass
   and c.conname = 'chat_themes_theme_check'
union all
select 'it still refuses anything else',
       case when pg_get_constraintdef(c.oid) like '%theme = ANY%'
             or pg_get_constraintdef(c.oid) like '%theme IN%'
       then 'ready' else 'CHECK IT' end
  from pg_constraint c
 where c.conrelid = 'public.chat_themes'::regclass
   and c.conname = 'chat_themes_theme_check';
