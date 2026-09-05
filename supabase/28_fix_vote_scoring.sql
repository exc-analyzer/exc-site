create or replace function public.apply_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type_val text;
  target_id_val   uuid;
  delta           integer;
begin
  if tg_op = 'INSERT' then
    target_type_val := new.target_type;
    target_id_val   := new.target_id;
    delta           := new.value;
  elsif tg_op = 'UPDATE' then
    target_type_val := new.target_type;
    target_id_val   := new.target_id;
    delta           := new.value - old.value;
  else
    target_type_val := old.target_type;
    target_id_val   := old.target_id;
    delta           := -old.value;
  end if;

  if target_type_val = 'comment' and delta <> 0 then
    perform set_config('exc.scoring', 'on', true);
    update public.comments
       set vote_score = vote_score + delta
     where id = target_id_val;
    perform set_config('exc.scoring', 'off', true);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
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
  github_created  timestamptz;
  recent integer;
  scoring boolean := coalesce(current_setting('exc.scoring', true), 'off') = 'on';
begin
  if tg_op = 'INSERT' then
    select p.created_at, p.gh_created_at
      into account_created, github_created
      from public.profiles p
     where p.id = new.author_id;

    if account_created is null then
      raise exception 'This account cannot comment yet.';
    end if;

    if github_created is null or github_created > now() - interval '30 days' then
      if account_created > now() - interval '24 hours' then
        raise exception 'Your GitHub account is new, so commenting opens 24 hours after you sign in here.';
      end if;
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

    if not scoring then
      new.vote_score := old.vote_score;
    end if;

    if new.body is not distinct from old.body then
      new.updated_at := old.updated_at;
      return new;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  perform set_config('exc.scoring', 'on', true);
  update public.comments c
     set vote_score = (
       select coalesce(sum(v.value), 0)
         from public.votes v
        where v.target_type = 'comment' and v.target_id = c.id
     );
end
$$;

select c.id, c.vote_score,
       (select coalesce(sum(v.value),0) from public.votes v
         where v.target_type='comment' and v.target_id=c.id) as real_sum,
       case when c.vote_score = (select coalesce(sum(v.value),0) from public.votes v
              where v.target_type='comment' and v.target_id=c.id)
            then 'matches' else 'STILL WRONG' end as result
  from public.comments c where c.deleted_at is null;
