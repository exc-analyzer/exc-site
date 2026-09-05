import { useEffect, useState } from "react";
import {
  loadFollowers,
  loadFollowing,
  loadMember,
  loadMemberFeed,
  loadMemberReplies,
  memberHref,
  removeFollower,
  type Member,
  type MemberReply,
} from "../../lib/people";
import {
  currentUserId,
  loadMyLikes,
  type FeedItem as Item,
} from "../../lib/feed";
import { supabase } from "../../lib/supabase";
import {
  accentColor,
  bannerHeightPx,
  bannerLook,
  bannerSize,
  statusOf,
  type StatusId,
} from "../../lib/profile";
import { formatDate, relativeTime } from "../../engine/shared";
import Icon from "../Icon";
import Verified from "../Verified";
import { Blank, BlockSkeleton, FeedSkeleton } from "../console/Chrome";
import { Avatar } from "../profile/ProfileEditor";
import FeedItem from "../feed/FeedItem";
import Composer from "../feed/Composer";
import PersonFollowButton from "./PersonFollowButton";
import { amIBlocking, blockPerson, canMessage, unblockPerson } from "../../lib/messages";
import { isFollowingPerson, loadMyBookmarks } from "../../lib/social";
import { loadPins, type PinnedRepo } from "../../lib/pins";

function loginFromPath(): string | null {
  const parts = window.location.pathname
    .replace(/^\/app\//, "")
    .split("/")
    .filter(Boolean);
  if (parts[0] !== "people" || !parts[1]) return null;
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(parts[1]) ? parts[1] : null;
}

const TABS = [
  { id: "posts", label: "Posts", count: (m: Member) => m.post_count },
  { id: "scans", label: "Scans", count: (m: Member) => m.scan_count },
  { id: "replies", label: "Replies", count: (m: Member) => m.comment_count },
  {
    id: "followers",
    label: "Followers",
    count: (m: Member) => m.follower_count,
  },
  {
    id: "following",
    label: "Following",
    count: (m: Member) => m.following_count,
  },
] as const;

type Tab = (typeof TABS)[number]["id"];

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; member: Member; items: Item[]; pins: PinnedRepo[] };

export default function MemberPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    function heard(event: Event) {
      const detail = (event as CustomEvent<{ id: string; status: StatusId | null }>)
        .detail;
      if (!detail) return;
      setState((prev) =>
        prev.kind === "ready" && prev.member.id === detail.id
          ? { ...prev, member: { ...prev.member, status: detail.status } }
          : prev,
      );
    }
    window.addEventListener("exc:status", heard);
    return () => window.removeEventListener("exc:status", heard);
  }, []);
  const [signedIn, setSignedIn] = useState(false);
  const [about, setAbout] = useState(false);
  const [iFollow, setIFollow] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [askBlock, setAskBlock] = useState(false);
  const [mutual, setMutual] = useState(false);
  const [tab, setTab] = useState<Tab>("posts");
  const [replies, setReplies] = useState<MemberReply[] | null>(null);
  const [followers, setFollowers] = useState<Member[] | null>(null);
  const [following, setFollowing] = useState<Member[] | null>(null);

  async function load() {
    const login = loginFromPath();
    if (!login) {
      setState({ kind: "missing" });
      return;
    }
    const member = await loadMember(login);
    if (!member) {
      setState({ kind: "missing" });
      return;
    }
    setIFollow(await isFollowingPerson(member.id));
    setMutual(await canMessage(member.id));
    setBlocked(await amIBlocking(member.id));
    const items = await loadMemberFeed(member.id);
    const [mine, kept, pins] = await Promise.all([
      loadMyLikes(items),
      loadMyBookmarks(items),
      loadPins(member.id),
    ]);
    setLikes(mine);
    setSaved(kept);
    setState({ kind: "ready", member, items, pins });
  }

  useEffect(() => {
    if (state.kind !== "ready") return;
    const id = state.member.id;
    if (tab === "replies" && replies === null)
      void loadMemberReplies(id).then(setReplies);
    if (tab === "followers" && followers === null)
      void loadFollowers(id).then(setFollowers);
    if (tab === "following" && following === null)
      void loadFollowing(id).then(setFollowing);
  }, [tab, state, replies, followers, following]);

  useEffect(() => {
    document.getElementById("exc-prerendered")?.remove();
    void (async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        setSignedIn(Boolean(data.session));
        setMe(await currentUserId());
      }
      await load();
    })();
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="space-y-6">
        <BlockSkeleton height="h-52" />
        <FeedSkeleton rows={3} />
      </div>
    );
  }

  if (state.kind === "missing") {
    return (
      <Blank
        icon="users"
        title="Nobody here by that name"
        lead="They have not signed in here yet. You can still look them up on GitHub."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {loginFromPath() && (
              <a
                href={`https://github.com/${loginFromPath()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
              >
                See them on GitHub
              </a>
            )}
            <a href="/app/" className="btn btn-quiet">
              Back to the feed
            </a>
          </div>
        }
      />
    );
  }

  const { member, items, pins } = state;
  const accent = accentColor(member.accent);
  const veiled = member.private_account && me !== member.id && !iFollow;
  const shown = items.filter((item) =>
    tab === "scans" ? item.kind === "report" : item.kind === "post",
  );

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <div
          className="relative"
          style={{
            height: bannerHeightPx(member.banner_height),
            background: bannerLook({
              accent: member.accent,
              accentTwo: member.accent_two,
              style: member.banner_style,
              angle: member.gradient_angle,
              seed: member.gh_login,
            }),
            backgroundSize: bannerSize(member.banner_style),
          }}
        >
          <button
            type="button"
            aria-label="About this account"
            aria-expanded={about}
            title="About this account"
            onClick={() => setAbout((v) => !v)}
            className={`absolute right-3 top-3 grid size-8 place-items-center rounded-full backdrop-blur-sm transition ${
              about
                ? "bg-black/45 text-white"
                : "bg-black/25 text-white/80 hover:bg-black/40 hover:text-white"
            }`}
          >
            <Icon name="info" size={16} />
          </button>
        </div>
        <div className="relative -mt-9 px-6 pb-6">
          <Avatar
            src={member.avatar_url}
            name={member.shown_name}
            accent={accent}
            size={72}
            shape={member.avatar_shape}
            ring={4}
          />
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <span className="flex items-center gap-2">
                <h1 className="min-w-0 truncate text-xl">
                  {member.shown_name}
                </h1>
                {member.verified && <Verified size={18} />}
              </span>
              <p className="font-mono text-sm text-[var(--color-muted)]">
                @{member.gh_login}
              </p>
              {statusOf(member.status) && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-2.5 py-1 text-xs text-[var(--color-muted)]">
                  <span aria-hidden="true">{statusOf(member.status)!.emoji}</span>
                  {statusOf(member.status)!.label}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`https://github.com/${member.gh_login}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
              >
                <Icon name="github" size={14} />
                GitHub
              </a>
              {me !== member.id && mutual && (
                <a
                  href={`/app/messages/?with=${member.id}`}
                  className="btn btn-ghost btn-sm"
                >
                  <Icon name="reply" size={14} />
                  Message
                </a>
              )}
              {me !== member.id && !blocked && (
                <PersonFollowButton
                  personId={member.id}
                  signedIn={signedIn}
                  privateAccount={member.private_account}
                  onChanged={() => void load()}
                />
              )}
              {me !== member.id && signedIn && (
                <button
                  type="button"
                  className={`btn btn-sm ${
                    blocked
                      ? "btn-ghost"
                      : "btn-quiet hover:text-[var(--color-bad)]"
                  }`}
                  onClick={() => {
                    if (blocked) {
                      void unblockPerson(member.id).then(() => void load());
                      return;
                    }
                    setAskBlock(true);
                  }}
                >
                  <Icon name="ban" size={14} />
                  {blocked ? "Unblock" : "Block"}
                </button>
              )}
            </div>
          </div>

          {askBlock && (
            <div className="surface mt-4 border-[var(--color-line-strong)] p-4">
              <p className="text-sm font-medium">Block {member.gh_login}?</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
                You both stop following each other, neither of you can write to
                the other, and you disappear from each other feeds. You can lift
                it whenever you like.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setAskBlock(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm bg-[var(--color-bad)] text-white"
                  onClick={() => {
                    setAskBlock(false);
                    void blockPerson(member.id).then(() => void load());
                  }}
                >
                  Block
                </button>
              </div>
            </div>
          )}

          {about && (
            <dl className="mt-4 grid gap-x-8 gap-y-2 rounded-[var(--radius-control)] border border-[var(--color-line)] px-4 py-3 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4 sm:block">
                <dt className="text-2xs uppercase tracking-wider text-[var(--color-faint)]">
                  Here since
                </dt>
                <dd className="sm:mt-0.5">{formatDate(member.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-4 sm:block">
                <dt className="text-2xs uppercase tracking-wider text-[var(--color-faint)]">
                  Scan history
                </dt>
                <dd className="sm:mt-0.5">
                  {member.scans_public ? "Open to everyone" : "Kept private"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 sm:block">
                <dt className="text-2xs uppercase tracking-wider text-[var(--color-faint)]">
                  Account
                </dt>
                <dd className="sm:mt-0.5">{member.private_account ? "Private" : "Open"}</dd>
              </div>
            </dl>
          )}

          {member.bio?.trim() && (
            <p className="mt-4 max-w-xl text-sm text-[var(--color-muted)]">
              {member.bio}
            </p>
          )}

          {pins.length > 0 && !veiled && (
            <div className="mt-5">
              <p className="eyebrow mb-3">Looks after</p>
              <ul className="grid gap-3 sm:grid-cols-3">
                {pins.map((pin) => (
                  <li key={`${pin.owner}/${pin.repo}`}>
                    <a
                      href={`/app/r/${pin.owner}/${pin.repo}/`}
                      className="surface surface-hover block h-full p-4"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: accent }}
                        />
                        <span className="min-w-0 truncate font-mono text-sm text-[var(--color-text)]">
                          {pin.owner}/{pin.repo}
                        </span>
                      </span>
                      {pin.note && (
                        <span className="mt-1.5 block text-xs text-[var(--color-muted)]">
                          {pin.note}
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <nav className="flex gap-1 overflow-x-auto border-t border-[var(--color-line)] px-3 py-2">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              aria-pressed={tab === entry.id}
              className={
                tab === entry.id ? "nav-pill nav-pill-active" : "nav-pill"
              }
            >
              {entry.label}
              {!veiled && (
                <span className="tabular-nums text-[var(--color-faint)]">
                  {entry.count(member)}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      {me === member.id && tab === "posts" && (
        <Composer onPosted={() => void load()} />
      )}

      {veiled ? (
        <Blank
          icon="eye"
          title={`${member.shown_name} keeps this account private`}
          lead="Ask to follow, and once they accept you will see their posts, their scans and who they follow."
        />
      ) : tab === "followers" || tab === "following" ? (
        <PeopleList
          people={tab === "followers" ? followers : following}
          empty={
            tab === "followers"
              ? `Nobody follows ${member.shown_name} yet`
              : `${member.shown_name} is not following anyone yet`
          }
          onRemove={
            me === member.id && tab === "followers"
              ? (person) => {
                  void (async () => {
                    const trouble = await removeFollower(person.id);
                    if (trouble) return;
                    setFollowers(
                      (was) => was?.filter((p) => p.id !== person.id) ?? null,
                    );
                  })();
                }
              : undefined
          }
        />
      ) : tab === "replies" ? (
        <ReplyList
          replies={replies}
          name={member.shown_name}
          listed={member.replies_public}
        />
      ) : shown.length === 0 ? (
        <Blank
          icon="compass"
          title={
            tab === "scans"
              ? `Nothing to show from ${member.shown_name}`
              : `${member.shown_name} has not posted anything yet`
          }
          lead={
            tab === "scans" && !member.scans_public
              ? "This account keeps its scan history to itself."
              : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          {shown.map((item) => {
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

function PeopleList({
  people,
  empty,
  onRemove,
}: {
  people: Member[] | null;
  empty: string;
  onRemove?: (person: Member) => void;
}) {
  if (people === null) return <FeedSkeleton rows={3} />;
  if (people.length === 0) return <Blank icon="users" title={empty} />;

  return (
    <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
      {people.map((person) => (
        <li
          key={person.id}
          className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[rgba(163,145,224,0.04)]"
        >
          <a
            href={memberHref(person.gh_login) ?? "#"}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <Avatar
              src={person.avatar_url}
              name={person.shown_name}
              shape={person.avatar_shape}
              accent={accentColor(person.accent)}
              size={34}
            />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate text-sm text-[var(--color-text)]">
                  {person.shown_name}
                </span>
                {person.verified && <Verified size={13} />}
              </span>
              <span className="block truncate font-mono text-xs text-[var(--color-muted)]">
                @{person.gh_login}
              </span>
            </span>
          </a>
          {onRemove ? (
            <button
              type="button"
              className="btn btn-quiet btn-sm shrink-0"
              onClick={() => onRemove(person)}
            >
              Remove
            </button>
          ) : (
            <Icon
              name="chevron"
              size={15}
              className="shrink-0 text-[var(--color-faint)]"
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function ReplyList({
  replies,
  name,
  listed,
}: {
  replies: MemberReply[] | null;
  name: string;
  listed: boolean;
}) {
  if (replies === null) return <FeedSkeleton rows={3} />;
  if (replies.length === 0)
    return (
      <Blank
        icon="reply"
        title={
          listed
            ? `${name} has not replied to anything yet`
            : `${name} keeps their replies off this page`
        }
        lead={
          listed
            ? undefined
            : "Their replies are still under the posts and scans they answered."
        }
      />
    );

  return (
    <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
      {replies.map((reply) => {
        const target =
          reply.report_owner && reply.report_repo
            ? `${reply.report_owner}/${reply.report_repo}`
            : null;
        const href = reply.post_id
          ? `/app/p/${reply.post_id}/`
          : target
            ? `/app/r/${reply.report_owner}/${reply.report_repo}/`
            : null;

        const body = (
          <>
            <span className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-[var(--color-faint)]">
              <span>Replied on a {reply.on_what}</span>
              {target && (
                <span className="font-mono text-[var(--color-muted)]">
                  {target}
                </span>
              )}
              <span>· {relativeTime(reply.created_at)}</span>
            </span>
            <span className="mt-1.5 line-clamp-3 [overflow-wrap:anywhere] text-sm text-[var(--color-text)]">
              {reply.body}
            </span>
          </>
        );

        return (
          <li key={reply.id}>
            {href ? (
              <a
                href={href}
                className="block px-5 py-4 transition hover:bg-[rgba(163,145,224,0.04)]"
              >
                {body}
              </a>
            ) : (
              <div className="px-5 py-4">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
