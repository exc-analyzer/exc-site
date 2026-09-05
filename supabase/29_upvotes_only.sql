delete from public.votes
 where target_type = 'comment' and value = -1;

alter table public.votes
  drop constraint if exists votes_comment_upvote_only;

alter table public.votes
  add constraint votes_comment_upvote_only
  check (target_type <> 'comment' or value = 1);

do $$
begin
  perform set_config('exc.scoring', 'on', true);
  update public.comments c
     set vote_score = (
       select coalesce(sum(v.value), 0)
         from public.votes v
        where v.target_type = 'comment' and v.target_id = c.id
     )
   where c.vote_score is distinct from (
       select coalesce(sum(v.value), 0)
         from public.votes v
        where v.target_type = 'comment' and v.target_id = c.id
     );
end
$$;

select 'downvotes gone' as step,
       case when not exists (select 1 from public.votes
              where target_type = 'comment' and value = -1)
            then 'clean' else 'STILL THERE' end as result
union all
select 'constraint in place',
       case when exists (select 1 from pg_constraint
              where conname = 'votes_comment_upvote_only')
            then 'ready' else 'MISSING' end
union all
select 'scores match',
       case when not exists (
              select 1 from public.comments c
               where c.vote_score is distinct from (
                 select coalesce(sum(v.value),0) from public.votes v
                  where v.target_type='comment' and v.target_id=c.id))
            then 'clean' else 'MISMATCH' end;
