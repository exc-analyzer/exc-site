import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { currentUserId } from '../../lib/feed';
import { mostScanned, repoHref, type ExploreRow } from '../../lib/explore';
import { memberHref, type Member } from '../../lib/people';
import { accentColor } from '../../lib/profile';
import { SectionTitle } from '../console/ui';
import { Avatar } from '../profile/ProfileEditor';
import Icon from '../Icon';

async function activeMembers(exclude: string | null, limit = 5): Promise<Member[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('member_profile')
    .select(
      'id, gh_login, avatar_url, accent, bio, created_at, shown_name, post_count, scan_count, comment_count, follower_count, following_count',
    )
    .order('post_count', { ascending: false })
    .order('scan_count', { ascending: false })
    .limit(limit + 1);
  if (error) return [];
  return ((data as unknown as Member[]) ?? [])
    .filter((m) => m.id !== exclude && m.post_count + m.scan_count > 0)
    .slice(0, limit);
}

export default function Suggestions() {
  const [people, setPeople] = useState<Member[]>([]);
  const [repos, setRepos] = useState<ExploreRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const me = await currentUserId();
      const [members, rows] = await Promise.all([activeMembers(me), mostScanned(5)]);
      setPeople(members);
      setRepos(rows);
      setReady(true);
    })();
  }, []);

  if (!ready || (people.length === 0 && repos.length === 0)) return null;

  return (
    <section className="space-y-6">
      <div>
        <SectionTitle>Somewhere to start</SectionTitle>
        <p className="-mt-2 text-sm text-[var(--color-muted)]">
          Following a person or a repository is what fills this page.
        </p>
      </div>

      {people.length > 0 && (
        <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          {people.map((person) => (
            <li key={person.id}>
              <a
                href={memberHref(person.gh_login) ?? '#'}
                className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[rgba(163,145,224,0.04)]"
              >
                <Avatar
                  src={person.avatar_url}
                  name={person.shown_name}
                  accent={accentColor(person.accent)}
                  size={34}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[var(--color-text)]">
                    {person.shown_name}
                  </span>
                  <span className="block truncate text-xs text-[var(--color-muted)]">
                    {person.post_count} post{person.post_count === 1 ? '' : 's'} ·{' '}
                    {person.scan_count} scan{person.scan_count === 1 ? '' : 's'}
                  </span>
                </span>
                <Icon name="chevron" size={15} className="text-[var(--color-faint)]" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {repos.length > 0 && (
        <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          {repos.map((row) => (
            <li key={`${row.owner}/${row.repo}`}>
              <a
                href={repoHref(row)}
                className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[rgba(163,145,224,0.04)]"
              >
                <Icon name="repo" size={16} className="text-[var(--color-faint)]" />
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-[var(--color-text)]">
                  {row.owner}/{row.repo}
                </span>
                <span className="shrink-0 text-xs text-[var(--color-muted)]">
                  {row.scan_count} scan{row.scan_count === 1 ? '' : 's'}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
