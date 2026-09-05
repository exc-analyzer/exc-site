import { useEffect, useRef, useState } from "react";
import {
  loadFollows,
  markAllSeen,
  unfollow,
  unreadTargets,
  type FollowActivity,
} from "../../lib/follows";
import { supabase } from "../../lib/supabase";
import { currentUserId } from "../../lib/feed";
import { loadFollowing, memberHref, type Member } from "../../lib/people";
import {
  acceptFollowRequest,
  declineFollowRequest,
  followPerson,
  isFollowingPerson,
  requestFollow,
  hasPendingRequest,
  loadFollowNews,
  loadFollowRequests,
  markFollowNewsSeen,
  unfollowPerson,
  type FollowNews,
  type FollowRequest,
} from "../../lib/social";
import { accentColor } from "../../lib/profile";
import { Avatar } from "../profile/ProfileEditor";
import Icon from "../Icon";
import Verified from "../Verified";
import { Card, Score } from "../console/ui";
import { Blank, FeedSkeleton } from "../console/Chrome";
import Suggestions from "./Suggestions";
import type { Tone } from "../console/ui";
import { relativeTime } from "../../engine/shared";

function scoreTone(score: number | null): Tone {
  if (score === null) return "muted";
  if (score >= 90) return "good";
  if (score >= 75) return "warn";
  return "bad";
}

function newsLine(row: FollowActivity): string | null {
  const parts: string[] = [];
  if (row.new_reports > 0) {
    parts.push(
      `${row.new_reports} new scan${row.new_reports === 1 ? "" : "s"}`,
    );
  }
  if (row.new_comments > 0) {
    parts.push(
      `${row.new_comments} new comment${row.new_comments === 1 ? "" : "s"}`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default function FollowingList() {
  const [rows, setRows] = useState<FollowActivity[] | null>(null);
  const [people, setPeople] = useState<Member[] | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"repos" | "people">("repos");
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [settled, setSettled] = useState<
    {
      person: FollowRequest;
      state: "accepted" | "mutual" | "requested";
      note: string | null;
    }[]
  >([]);
  const [showAll, setShowAll] = useState(false);
  const [news, setNews] = useState<FollowNews[]>([]);
  const settledRef = useRef(settled);

  async function refreshRequests() {
    const [inbox, told] = await Promise.all([
      loadFollowRequests(),
      loadFollowNews(),
    ]);
    setRequests(inbox);
    setNews(told);

    const standing = settledRef.current;
    if (standing.length === 0) return;

    const fresh = await Promise.all(
      standing.map(async (row) => {
        const following = await isFollowingPerson(row.person.from_id);
        if (following) {
          return { ...row, state: "mutual" as const, note: null };
        }
        const waiting = await hasPendingRequest(row.person.from_id);
        return {
          ...row,
          state: waiting ? ("requested" as const) : ("accepted" as const),
          note: null,
        };
      }),
    );
    setSettled(fresh);
  }

  async function refresh() {
    setRows(await loadFollows());
  }

  async function refreshPeople() {
    const me = await currentUserId();
    setPeople(me ? await loadFollowing(me) : []);
  }

  useEffect(() => {
    void (async () => {
      if (!supabase) {
        setSignedIn(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      const has = Boolean(data.session);
      setSignedIn(has);
      if (has) {
        await Promise.all([refresh(), refreshPeople(), refreshRequests()]);
        await markAllSeen();
        await markFollowNewsSeen();
        window.dispatchEvent(new CustomEvent("exc:seen"));
      }
    })();
  }, []);

  useEffect(() => {
    settledRef.current = settled;
  }, [settled]);

  useEffect(() => {
    const wake = () => {
      void (async () => {
        await Promise.all([refreshRequests(), refresh()]);
        if (document.visibilityState !== "visible") return;
        await markAllSeen();
        await markFollowNewsSeen();
        window.dispatchEvent(new CustomEvent("exc:seen"));
      })();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") wake();
    };
    window.addEventListener("exc:mail-ping", wake);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.removeEventListener("exc:mail-ping", wake);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  if (signedIn === null) return <FeedSkeleton rows={3} />;

  if (!signedIn) {
    return (
      <Blank
        icon="bell"
        title="Following needs an account"
        lead="Follow a repository and this page tells you when someone scans it again or leaves a comment. Scanning itself still works without signing in."
      />
    );
  }

  if (rows === null || people === null) return <FeedSkeleton rows={3} />;

  if (rows.length === 0 && people.length === 0 && requests.length === 0) {
    return (
      <div className="space-y-8">
        <Blank
          icon="bell"
          title="You are not following anything yet"
          lead="Follow a person or a repository and whatever happens next shows up here."
        />
        <Suggestions />
      </div>
    );
  }

  const unread = unreadTargets(rows);

  const newsBox =
    news.length > 0 ? (
      <section className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <p className="border-b border-[var(--color-line)] px-5 py-3 text-sm">
          Follows
        </p>
        <ul className="divide-y divide-[var(--color-line)]">
          {news.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 px-5 py-3.5"
            >
              <Avatar
                src={item.avatar_url}
                name={item.shown_name}
                accent={accentColor(item.accent)}
                size={34}
              />
              <a
                href={memberHref(item.gh_login) ?? "#"}
                className="min-w-0 flex-1"
              >
                <span className="flex min-w-0 items-center gap-1">
                  <span className="truncate text-sm text-[var(--color-text)] hover:underline">
                    {item.shown_name}
                  </span>
                  {item.verified && <Verified size={13} />}
                </span>
                <span className="block truncate text-xs text-[var(--color-muted)]">
                  {item.mutual
                    ? "accepted you — you follow each other now"
                    : "accepted your follow request"}
                </span>
              </a>
              <span className="shrink-0 text-2xs text-[var(--color-faint)]">
                {relativeTime(item.at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const requestBox =
    requests.length > 0 || settled.length > 0 ? (
      <section className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line-active)] bg-[var(--color-surface)]">
        <p className="border-b border-[var(--color-line)] px-5 py-3 text-sm">
          {requests.length > 0
            ? `${requests.length} ${requests.length === 1 ? "person wants" : "people want"} to follow you`
            : settled.length === 1
              ? "You accepted a follower"
              : `You accepted ${settled.length} followers`}
        </p>
        <ul className="divide-y divide-[var(--color-line)]">
          {settled.map(({ person, state, note }) => (
            <li
              key={`settled-${person.from_id}`}
              className="flex items-center gap-3 px-5 py-3.5"
            >
              <Avatar
                src={person.avatar_url}
                name={person.shown_name}
                accent={accentColor(person.accent)}
                size={34}
              />
              <a
                href={memberHref(person.gh_login) ?? "#"}
                className="min-w-0 flex-1"
              >
                <span className="flex min-w-0 items-center gap-1">
                  <span className="truncate text-sm text-[var(--color-text)] hover:underline">
                    {person.shown_name}
                  </span>
                  {person.verified && <Verified size={13} />}
                </span>
                <span
                  className={`block truncate text-xs ${
                    note ? "text-[var(--color-bad)]" : "text-[var(--color-good)]"
                  }`}
                >
                  {note ??
                    (state === "mutual"
                      ? "You follow each other now"
                      : state === "requested"
                        ? "Now follows you · your request is waiting"
                        : "Now follows you")}
                </span>
              </a>
              {state === "mutual" ? (
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-muted)]">
                  <Icon name="check" size={13} />
                  Following
                </span>
              ) : state === "requested" ? (
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-muted)]">
                  <Icon name="clock" size={13} />
                  Requested
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm shrink-0"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void followPerson(person.from_id)
                      .then(async (trouble) => {
                        if (!trouble) {
                          setSettled((rows) =>
                            rows.map((r) =>
                              r.person.from_id === person.from_id
                                ? { ...r, state: "mutual", note: null }
                                : r,
                            ),
                          );
                          await refreshPeople();
                          return;
                        }
                        const asked = await requestFollow(person.from_id);
                        setSettled((rows) =>
                          rows.map((r) =>
                            r.person.from_id === person.from_id
                              ? asked
                                ? { ...r, note: asked }
                                : { ...r, state: "requested", note: null }
                              : r,
                          ),
                        );
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  Follow back
                </button>
              )}
            </li>
          ))}

          {(showAll ? requests : requests.slice(0, 5)).map((request) => (
            <li key={request.from_id} className="flex items-center gap-3 px-5 py-3.5">
              <Avatar
                src={request.avatar_url}
                name={request.shown_name}
                accent={accentColor(request.accent)}
                size={34}
              />
              <a href={memberHref(request.gh_login) ?? "#"} className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1">
                  <span className="truncate text-sm text-[var(--color-text)] hover:underline">
                    {request.shown_name}
                  </span>
                  {request.verified && <Verified size={13} />}
                </span>
                <span className="block truncate font-mono text-xs text-[var(--color-muted)]">
                  @{request.gh_login}
                </span>
              </a>
              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void acceptFollowRequest(request.from_id)
                      .then(async () => {
                        const already = await isFollowingPerson(request.from_id);
                        setSettled((rows) => [
                          {
                            person: request,
                            state: already ? "mutual" : "accepted",
                            note: null,
                          },
                          ...rows.filter(
                            (r) => r.person.from_id !== request.from_id,
                          ),
                        ]);
                        await refreshRequests();
                        await refreshPeople();
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void declineFollowRequest(request.from_id)
                      .then(refreshRequests)
                      .finally(() => setBusy(false));
                  }}
                >
                  Decline
                </button>
              </span>
            </li>
          ))}
        </ul>

        {requests.length > 5 && (
          <button
            type="button"
            className="w-full border-t border-[var(--color-line)] px-5 py-2.5 text-xs text-[var(--color-muted)] transition hover:bg-[rgba(163,145,224,0.05)] hover:text-[var(--color-text)]"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? "Show fewer"
              : `Show ${requests.length - 5} more`}
          </button>
        )}
      </section>
    ) : null;

  return (
    <div className="space-y-4">
      {requestBox}
      {newsBox}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setTab("repos")}
          aria-pressed={tab === "repos"}
          className={tab === "repos" ? "nav-pill nav-pill-active" : "nav-pill"}
        >
          <Icon name="repo" size={14} />
          Repositories
          <span className="tabular-nums text-[var(--color-faint)]">
            {rows.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab("people")}
          aria-pressed={tab === "people"}
          className={tab === "people" ? "nav-pill nav-pill-active" : "nav-pill"}
        >
          <Icon name="users" size={14} />
          People
          <span className="tabular-nums text-[var(--color-faint)]">
            {people.length}
          </span>
        </button>
      </div>

      {tab === "people" ? (
        people.length === 0 ? (
          <Blank
            icon="users"
            title="You are not following anyone yet"
            lead="Open someone from the feed and press Follow, and what they write lands in your home feed."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
            {people.map((person) => (
              <li
                key={person.id}
                className="flex items-center gap-3 px-5 py-3.5"
              >
                <Avatar
                  src={person.avatar_url}
                  name={person.shown_name}
                  accent={accentColor(person.accent)}
                  shape={person.avatar_shape}
                  size={34}
                />
                <a
                  href={memberHref(person.gh_login) ?? "#"}
                  className="min-w-0 flex-1"
                >
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-sm text-[var(--color-text)] hover:underline">
                      {person.shown_name}
                    </span>
                    {person.verified && <Verified size={13} />}
                  </span>
                  <span className="block truncate font-mono text-xs text-[var(--color-muted)]">
                    @{person.gh_login}
                  </span>
                </a>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm shrink-0"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void unfollowPerson(person.id)
                      .then(refreshPeople)
                      .finally(() => setBusy(false));
                  }}
                >
                  Unfollow
                </button>
              </li>
            ))}
          </ul>
        )
      ) : rows.length === 0 ? (
        <Blank
          icon="repo"
          title="You are not following any repository yet"
          lead="Open a repository page and press Follow to hear when it is scanned again."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--color-muted)]">
              {unread === 0
                ? `Following ${rows.length}. Nothing new.`
                : `${unread} of ${rows.length} have something new.`}
            </p>
            {unread > 0 && (
              <button
                type="button"
                className="btn btn-quiet"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void markAllSeen()
                    .then(refresh)
                    .finally(() => setBusy(false));
                }}
              >
                Mark all as read
              </button>
            )}
          </div>

          <ul className="space-y-3">
            {rows.map((row) => {
              const label = row.repo ? `${row.owner}/${row.repo}` : row.owner;
              const href = row.repo
                ? `/app/r/${row.owner}/${row.repo}/`
                : `/app/u/${row.owner}/`;
              const news = newsLine(row);
              return (
                <li key={label}>
                  <Card>
                    <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <a
                          href={href}
                          className="font-mono text-sm hover:underline"
                        >
                          {label}
                        </a>
                        <p className="mt-1 text-xs text-[var(--color-muted)]">
                          {row.report_count} report
                          {row.report_count === 1 ? "" : "s"}
                          {row.last_report_at &&
                            ` · last scanned ${relativeTime(row.last_report_at)}`}
                        </p>
                        {news && (
                          <p className="mt-1 text-xs text-[var(--color-good)]">
                            {news}
                          </p>
                        )}
                      </div>

                      {row.score !== null && (
                        <Score
                          value={row.score}
                          tone={scoreTone(row.score)}
                          caption="security"
                        />
                      )}

                      <button
                        type="button"
                        className="btn btn-quiet shrink-0"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          void unfollow(row.owner, row.repo)
                            .then(refresh)
                            .finally(() => setBusy(false));
                        }}
                      >
                        Unfollow
                      </button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
