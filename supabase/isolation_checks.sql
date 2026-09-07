do $$
declare
  a uuid := '8a000000-0000-4000-8000-00000000000a';
  b uuid := '8b000000-0000-4000-8000-00000000000b';
  c uuid := '8c000000-0000-4000-8000-00000000000c';
  orig text := current_user;
  out text := '';
  n integer;
  pid uuid;
  mid uuid;
  bad integer := 0;
begin
  insert into auth.users (id) values (a), (b), (c);
  update public.profiles
     set gh_created_at = now() - interval '400 days',
         private_account = true
   where id = a;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  insert into public.posts (author_id, body) values (a, 'kept behind the gate') returning id into pid;
  perform set_config('role',orig,true);

  insert into public.people_follows (follower_id, followee_id) values (a, b), (b, a);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  insert into public.messages (from_id, to_id, body) values (a, b, 'between the two of us') returning id into mid;
  perform set_config('role',orig,true);
  delete from public.people_follows where follower_id in (a,b) and followee_id in (a,b);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);

  select count(*) into n from public.messages m where m.id = mid;
  if n <> 0 then bad := bad + 1; end if;
  out := out || 'an outsider reads a private message: ' || case when n = 0 then 'refused' else 'LEAK' end || ' | ';
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);

  select count(*) into n from public.messages m where m.id = mid;
  if n <> 1 then bad := bad + 1; end if;
  out := out || 'the person it was sent to can read it: ' || case when n = 1 then 'yes' else 'BROKEN' end || ' | ';

  select count(*) into n from public.posts p where p.id = pid;
  if n <> 0 then bad := bad + 1; end if;
  out := out || 'B reads a private account post: ' || case when n = 0 then 'refused' else 'LEAK' end || ' | ';

  select count(*) into n from public.bookmarks x where x.user_id = a;
  if n <> 0 then bad := bad + 1; end if;
  out := out || 'B reads A bookmarks: ' || case when n = 0 then 'refused' else 'LEAK' end || ' | ';

  select count(*) into n from public.blocks x where x.blocker_id = a;
  if n <> 0 then bad := bad + 1; end if;
  out := out || 'B reads A blocks: ' || case when n = 0 then 'refused' else 'LEAK' end || ' | ';

  select count(*) into n from public.follow_news x where x.user_id = a;
  if n <> 0 then bad := bad + 1; end if;
  out := out || 'B reads A follow notices: ' || case when n = 0 then 'refused' else 'LEAK' end || ' | ';

  select count(*) into n from public.chat_themes x where x.user_id = a;
  if n <> 0 then bad := bad + 1; end if;
  out := out || 'B reads A chat themes: ' || case when n = 0 then 'refused' else 'LEAK' end || ' | ';

  select count(*) into n from public.conversation_clears x where x.user_id = a;
  if n <> 0 then bad := bad + 1; end if;
  out := out || 'B reads A cleared conversations: ' || case when n = 0 then 'refused' else 'LEAK' end || ' | ';

  begin
    perform public.set_verified('nobody', true);
    bad := bad + 1;
    out := out || 'B calls a moderator tool: LEAK | ';
  exception when others then
    out := out || 'B calls a moderator tool: refused | ';
  end;

  perform set_config('role',orig,true);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  select count(*) into n from public.messages m where m.id = mid;
  if n <> 1 then bad := bad + 1; end if;
  out := out || 'A still reads their own message: ' || case when n = 1 then 'yes' else 'BROKEN' end;
  perform set_config('role',orig,true);

  raise exception 'ISOLATION % :: %', case when bad = 0 then 'ALL CLEAR' else bad::text || ' FAILURES' end, out;
end;
$$;
