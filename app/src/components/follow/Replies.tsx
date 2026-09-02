import { useEffect, useState } from 'react';
import { getCommand } from '../../engine';
import {
  lastSeenAt,
  loadMyReplies,
  markSeen,
  replyHref,
  unseen,
  type Reply,
} from '../../lib/notifications';
import { relativeTime } from '../../engine/shared';
import { SectionTitle } from '../console/ui';
import { Avatar } from '../profile/ProfileEditor';

function what(reply: Reply): string {
  if (reply.on_what === 'comment') return 'replied to you';
  if (reply.on_what === 'post') return 'replied to your post';
  if (reply.report_kind) {
    const target = reply.report_repo
      ? `${reply.report_owner}/${reply.report_repo}`
      : reply.report_owner;
    return `replied on your ${getCommand(reply.report_kind).name.toLowerCase()} of ${target}`;
  }
  return 'replied to your scan';
}

export default function Replies() {
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [since, setSince] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [rows, seen] = await Promise.all([loadMyReplies(), lastSeenAt()]);
      setReplies(rows);
      setSince(seen);
      if (rows.length > 0) await markSeen();
    })();
  }, []);

  if (replies === null || replies.length === 0) return null;

  const fresh = unseen(replies, since);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <SectionTitle>Replies to you</SectionTitle>
        {fresh > 0 && (
          <span className="text-2xs uppercase tracking-wider text-[var(--color-accent)]">
            {fresh} new
          </span>
        )}
      </div>

      <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        {replies.map((reply) => {
          const isNew = since !== null && reply.created_at > since;
          return (
            <li key={reply.id}>
              <a
                href={replyHref(reply)}
                className={`flex gap-3 px-5 py-3.5 transition hover:bg-[rgba(163,145,224,0.04)] ${
                  isNew ? 'bg-[var(--color-primary-soft)]' : ''
                }`}
              >
                <Avatar src={reply.from_avatar} name={reply.from_login} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[var(--color-faint)]">
                    <span className="font-medium text-[var(--color-text)]">{reply.from_login}</span>{' '}
                    {what(reply)} · {relativeTime(reply.created_at)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted)]">{reply.body}</p>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
