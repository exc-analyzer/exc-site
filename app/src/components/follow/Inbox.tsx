import { useEffect, useState } from "react";
import { getCommand } from "../../engine";
import {
  lastSeenAt,
  loadMyMentions,
  loadMyReplies,
  markSeen,
  mentionHref,
  replyHref,
  type Mention,
  type Reply,
} from "../../lib/notifications";
import { relativeTime } from "../../engine/shared";
import { SectionTitle } from "../console/ui";
import { Avatar } from "../profile/ProfileEditor";
import Icon, { type IconName } from "../Icon";

const INBOX_PREVIEW = 6;

interface Entry {
  id: string;
  key: string;
  at: string;
  who: string;
  avatar: string | null;
  what: string;
  body: string;
  href: string;
  icon: IconName;
}

function target(
  owner: string | null,
  repo: string | null,
  kind: string | null,
): string {
  const where = repo ? `${owner}/${repo}` : owner;
  return kind
    ? `your ${getCommand(kind as never).name.toLowerCase()} of ${where}`
    : "your scan";
}

function fromReply(reply: Reply): Entry {
  const what =
    reply.on_what === "comment"
      ? "replied to you"
      : reply.on_what === "post"
        ? "replied to your post"
        : `replied on ${target(reply.report_owner, reply.report_repo, reply.report_kind)}`;
  return {
    id: `reply:${reply.id}`,
    key: `comment:${reply.id}`,
    at: reply.created_at,
    who: reply.from_login,
    avatar: reply.from_avatar,
    what,
    body: reply.body,
    href: replyHref(reply),
    icon: "reply",
  };
}

function fromMention(mention: Mention): Entry {
  const where = mention.post_id
    ? "in a post"
    : mention.report_owner
      ? `on ${target(mention.report_owner, mention.report_repo, mention.report_kind)}`
      : "in a reply";
  return {
    id: `mention:${mention.id}`,
    key: mention.comment_id
      ? `comment:${mention.comment_id}`
      : `mention:${mention.id}`,
    at: mention.created_at,
    who: mention.from_login,
    avatar: mention.from_avatar,
    what: `mentioned you ${where}`,
    body: mention.body ?? "",
    href: mentionHref(mention),
    icon: "users",
  };
}

export default function Inbox() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    void (async () => {
      const [replies, mentions, seen] = await Promise.all([
        loadMyReplies(),
        loadMyMentions(),
        lastSeenAt(),
      ]);
      const already = new Set<string>();
      const merged = [...replies.map(fromReply), ...mentions.map(fromMention)]
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .filter((entry) => {
          if (already.has(entry.key)) return false;
          already.add(entry.key);
          return true;
        });
      setEntries(merged);
      setSince(seen);
      if (merged.length > 0) {
        await markSeen();
        window.dispatchEvent(new CustomEvent("exc:seen"));
      }
    })();
  }, []);

  if (entries === null || entries.length === 0) return null;

  const fresh = since ? entries.filter((e) => e.at > since).length : 0;
  const onScreen = showAll ? entries : entries.slice(0, INBOX_PREVIEW);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <SectionTitle>Addressed to you</SectionTitle>
        {fresh > 0 && (
          <span className="text-2xs uppercase tracking-wider text-[var(--color-accent)]">
            {fresh} new
          </span>
        )}
      </div>

      <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        {onScreen.map((entry) => {
          const isNew = since !== null && entry.at > since;
          return (
            <li key={entry.id}>
              <a
                href={entry.href}
                className={`flex gap-3 px-5 py-3.5 transition hover:bg-[rgba(163,145,224,0.04)] ${
                  isNew ? "bg-[var(--color-primary-soft)]" : ""
                }`}
              >
                <Avatar src={entry.avatar} name={entry.who} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--color-faint)]">
                    <Icon name={entry.icon} size={12} />
                    <span className="font-medium text-[var(--color-text)]">
                      {entry.who}
                    </span>
                    {entry.what} · {relativeTime(entry.at)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted)]">
                    {entry.body}
                  </p>
                </div>
              </a>
            </li>
          );
        })}
      </ul>

      {entries.length > INBOX_PREVIEW && (
        <div className="pt-3 text-center">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll
              ? "Show fewer"
              : `Show all ${entries.length}`}
          </button>
        </div>
      )}
    </section>
  );
}
