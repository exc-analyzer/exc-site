# Moderation

How inappropriate content is dealt with here.

## Profile pictures: GitHub does the verifying

Users **cannot upload** a picture. The profile picture always comes from the
GitHub account.

This decision removes a problem rather than solving it. Uploading came first,
along with a browser-side content check (nsfwjs) — which **did not work**: the
package does not publish its model in a form that can be fetched from a CDN
(it is a JavaScript module, not JSON), and there is no publicly hosted model.
The code failed silently and accepted every image.

A check that runs in the browser is also bypassed by anyone who talks to the
Storage API directly. On a zero budget, moderation that is both automatic
**and** unbypassable is not achievable.

Handing the picture to GitHub does not solve that, it makes it irrelevant:

- GitHub already runs its own content moderation
- Accounts are verified there, and they close accounts that break the rules
- There is nothing left for us to store, review or take down

The display **name** stays customisable: unlike an image, text can be judged
at a glance, and `@gh_login` always sits next to it.

## What protects comments

| Control | Where |
|---|---|
| A new account cannot comment for its first 24 hours | trigger |
| At most 20 comments an hour | trigger |
| Every comment is tied to a verified GitHub account | Auth |
| Reporting | `abuse_reports` |

## Reading the reports

Supabase SQL Editor:

```sql
select a.created_at,
       a.target_type,
       a.target_id,
       a.reason,
       r.gh_login as reported_by
  from public.abuse_reports a
  join public.profiles r on r.id = a.reporter_id
 where a.status = 'open'
 order by a.created_at desc;
```

## Removing a comment

```sql
update public.comments
   set deleted_at = now(), body = '[removed]'
 where id = 'COMMENT_UUID';
```

## Silencing a user

There is no permanent ban mechanism yet. For now:

```sql
update public.comments
   set deleted_at = now(), body = '[removed]'
 where author_id = 'USER_UUID';
```

For repeat offenders the GitHub account is known, so it can also be reported
to GitHub.
