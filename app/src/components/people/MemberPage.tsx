import { useEffect, useState } from 'react';
import { loadMember, loadMemberFeed, type Member } from '../../lib/people';
import { currentUserId, loadMyLikes, type FeedItem as Item } from '../../lib/feed';
import { supabase } from '../../lib/supabase';
import { accentColor } from '../../lib/profile';
import { formatDate } from '../../engine/shared';
import { Card, Empty, ExternalLink } from '../console/ui';
import { Avatar } from '../profile/ProfileEditor';
import FeedItem from '../feed/FeedItem';
import PersonFollowButton from './PersonFollowButton';
import { loadMyBookmarks } from '../../lib/social';

function loginFromPath(): string | null {
  const parts = window.location.pathname
    .replace(/^\/app\//, '')
    .split('/')
    .filter(Boolean);
  if (parts[0] !== 'people' || !parts[1]) return null;
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(parts[1]) ? parts[1] : null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'ready'; member: Member; items: Item[] };

export default function MemberPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [me, setMe] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  async function load() {
    const login = loginFromPath();
    if (!login) {
      setState({ kind: 'missing' });
      return;
    }
    const member = await loadMember(login);
    if (!member) {
      setState({ kind: 'missing' });
      return;
    }
    const items = await loadMemberFeed(member.id);
    const [mine, kept] = await Promise.all([loadMyLikes(items), loadMyBookmarks(items)]);
    setLikes(mine);
    setSaved(kept);
    setState({ kind: 'ready', member, items });
  }

  useEffect(() => {
    document.getElementById('exc-prerendered')?.remove();
    void (async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        setSignedIn(Boolean(data.session));
        setMe(await currentUserId());
      }
      await load();
    })();
  }, []);

  if (state.kind === 'loading') {
    return <p className="text-sm text-[var(--color-muted)]">Loading…</p>;
  }

  if (state.kind === 'missing') {
    return (
      <Card>
        <div className="px-6 py-10">
          <Empty>
            Nobody here by that name.{' '}
            <a href="/app/" className="link">
              Back to the feed
            </a>
          </Empty>
        </div>
      </Card>
    );
  }

  const { member, items } = state;
  const accent = accentColor(member.accent);

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <div
          className="h-20"
          style={{ background: `linear-gradient(135deg, ${accent}44, transparent 70%)` }}
        />
        <div className="-mt-9 px-6 pb-6">
          <Avatar src={member.avatar_url} name={member.shown_name} accent={accent} size={72} />
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl">{member.shown_name}</h1>
              <p className="font-mono text-sm text-[var(--color-muted)]">@{member.gh_login}</p>
            </div>
            <div className="flex items-center gap-3">
              <ExternalLink href={`https://github.com/${member.gh_login}`}>GitHub</ExternalLink>
              {me !== member.id && <PersonFollowButton personId={member.id} signedIn={signedIn} />}
            </div>
          </div>

          {member.bio?.trim() && (
            <p className="mt-4 max-w-xl text-sm text-[var(--color-muted)]">{member.bio}</p>
          )}

          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
            {[
              { label: 'Followers', value: member.follower_count },
              { label: 'Following', value: member.following_count },
              { label: 'Posts', value: member.post_count },
              { label: 'Scans', value: member.scan_count },
              { label: 'Replies', value: member.comment_count },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="text-2xs uppercase tracking-wider text-[var(--color-faint)]">
                  {stat.label}
                </dt>
                <dd className="mt-0.5 text-lg tabular-nums">{stat.value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-2xs uppercase tracking-wider text-[var(--color-faint)]">Here since</dt>
              <dd className="mt-0.5 text-lg">{formatDate(member.created_at)}</dd>
            </div>
          </dl>
        </div>
      </header>

      {items.length === 0 ? (
        <Empty>{member.shown_name} has not posted or scanned anything yet.</Empty>
      ) : (
        <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          {items.map((item) => {
            const key = `${item.kind}:${item.id}`;
            return (
              <li key={key}>
                <FeedItem
                  item={item}
                  liked={likes.has(key)}
                  saved={saved.has(key)}
                  mine={Boolean(me) && item.author_id === me}
                  signedIn={signedIn}
                  onSaved={
                    signedIn
                      ? (on) =>
                          setSaved((prev) => {
                            const next = new Set(prev);
                            if (on) next.add(key);
                            else next.delete(key);
                            return next;
                          })
                      : undefined
                  }
                  onChanged={() => void load()}
                  onLiked={(on) =>
                    setLikes((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(key);
                      else next.delete(key);
                      return next;
                    })
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
