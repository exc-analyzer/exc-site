import { useEffect, useState } from "react";
import {
  currentUserId,
  loadMyLikes,
  loadPost,
  postStanding,
  targetHref,
  targetLabel,
  type FeedItem as Item,
} from "../../lib/feed";
import { supabase } from "../../lib/supabase";
import { Blank, FeedSkeleton } from "../console/Chrome";
import Icon from "../Icon";
import { signInWithGitHub } from "../../lib/auth";
import Comments from "../report/Comments";
import FeedItem from "./FeedItem";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function postIdFromPath(): string | null {
  const parts = window.location.pathname
    .replace(/^\/app\//, "")
    .split("/")
    .filter(Boolean);
  const id = parts[0] === "p" ? parts[1] : null;
  return id && UUID.test(id) ? id : null;
}

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "locked" }
  | { kind: "ready"; item: Item; liked: boolean };

export default function PostPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [me, setMe] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    document.getElementById("exc-prerendered")?.remove();
    void (async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        setSignedIn(Boolean(data.session));
        setMe(await currentUserId());
      }
      const id = postIdFromPath();
      if (!id) {
        setState({ kind: "missing" });
        return;
      }
      const item = await loadPost(id);
      if (!item) {
        const standing = await postStanding(id);
        setState({
          kind: standing === "private" || standing === "open" ? "locked" : "missing",
        });
        return;
      }
      const mine = await loadMyLikes([item]);
      setState({ kind: "ready", item, liked: mine.has(`post:${item.id}`) });
    })();
  }, []);

  if (state.kind === "loading") return <FeedSkeleton rows={1} />;

  if (state.kind === "missing") {
    return (
      <Blank
        icon="quote"
        title="This post is gone"
        lead="Its author may have deleted it."
        action={
          <a href="/app/" className="btn btn-ghost">
            Back to the feed
          </a>
        }
      />
    );
  }

  if (state.kind === "locked") {
    return (
      <section className="rise-in overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="rule-brand" />
        <div className="px-6 py-8 text-center sm:px-10 sm:py-10">
          <span className="rise-in-1 mx-auto mb-5 grid size-12 place-items-center rounded-full border border-[var(--color-line)] text-[var(--color-muted)]">
            <Icon name="eye" size={22} />
          </span>
          <h1 className="rise-in-2 text-xl">This one is kept for a smaller circle</h1>
          <p className="rise-in-3 mx-auto mt-3 max-w-md text-sm text-[var(--color-muted)]">
            {signedIn
              ? "Whoever wrote it keeps their account private. Follow them, and once they accept, everything they post opens up for you."
              : "Whoever wrote it keeps their account private. Sign in with GitHub and ask to follow them — it takes one click, and the rest of the site is open to you either way."}
          </p>
          <div className="rise-in-4 mt-6 flex flex-wrap justify-center gap-2">
            {!signedIn && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void signInWithGitHub()}
              >
                <Icon name="github" size={15} />
                Sign in with GitHub
              </button>
            )}
            <a href="/app/explore/" className="btn btn-ghost">
              <Icon name="compass" size={15} />
              See what holds up
            </a>
            <a href="/app/" className="btn btn-quiet">
              Back to the feed
            </a>
          </div>
        </div>
      </section>
    );
  }

  const label = targetLabel(state.item);
  const repoHref = targetHref(state.item);

  return (
    <div className="space-y-5">
      {label && repoHref && (
        <p className="text-xs text-[var(--color-muted)]">
          About{" "}
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

      <Comments
        target={{ kind: "post", id: state.item.id }}
        ownerLogin={state.item.author_login}
      />
    </div>
  );
}
