import { useEffect, useState } from 'react';
import {
  currentUserId,
  loadMyLikes,
  loadPost,
  targetHref,
  targetLabel,
  type FeedItem as Item,
} from '../../lib/feed';
import { supabase } from '../../lib/supabase';
import { Card, Empty } from '../console/ui';
import Comments from '../report/Comments';
import FeedItem from './FeedItem';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function postIdFromPath(): string | null {
  const parts = window.location.pathname
    .replace(/^\/app\//, '')
    .split('/')
    .filter(Boolean);
  const id = parts[0] === 'p' ? parts[1] : null;
  return id && UUID.test(id) ? id : null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'ready'; item: Item; liked: boolean };

export default function PostPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [me, setMe] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    document.getElementById('exc-prerendered')?.remove();
    void (async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        setSignedIn(Boolean(data.session));
        setMe(await currentUserId());
      }
      const id = postIdFromPath();
      if (!id) {
        setState({ kind: 'missing' });
        return;
      }
      const item = await loadPost(id);
      if (!item) {
        setState({ kind: 'missing' });
        return;
      }
      const mine = await loadMyLikes([item]);
      setState({ kind: 'ready', item, liked: mine.has(`post:${item.id}`) });
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
            This post is gone.{' '}
            <a href="/app/" className="link">
              Back to the feed
            </a>
          </Empty>
        </div>
      </Card>
    );
  }

  const label = targetLabel(state.item);
  const repoHref = targetHref(state.item);

  return (
    <div className="space-y-5">
      {label && repoHref && (
        <p className="text-xs text-[var(--color-muted)]">
          About{' '}
          <a href={repoHref} className="link font-mono">
            {label}
          </a>
        </p>
      )}

      <FeedItem
        item={state.item}
        liked={state.liked}
        mine={Boolean(me) && state.item.author_id === me}
        signedIn={signedIn}
        onChanged={() => window.location.reload()}
        onLiked={(liked) => setState({ ...state, liked })}
      />

      <Comments target={{ kind: 'post', id: state.item.id }} />
    </div>
  );
}
