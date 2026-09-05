import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { currentUserId } from "../../lib/feed";
import { MEMBER_COLUMNS, memberHref, type Member } from "../../lib/people";
import { accentColor } from "../../lib/profile";
import { SectionTitle } from "../console/ui";
import { Avatar } from "../profile/ProfileEditor";
import Icon from "../Icon";
import Verified from "../Verified";

async function activeMembers(
  exclude: string | null,
  limit = 5,
): Promise<Member[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("member_profile")
    .select(MEMBER_COLUMNS)
    .eq("private_account", false)
    .order("post_count", { ascending: false })
    .order("scan_count", { ascending: false })
    .limit(limit + 1);
  if (error) return [];
  return ((data as unknown as Member[]) ?? [])
    .filter((m) => m.id !== exclude && m.post_count + m.scan_count > 0)
    .slice(0, limit);
}

export default function Suggestions({
  title = "Somewhere to start",
  lead = "Following someone is what fills this page.",
}: {
  title?: string;
  lead?: string;
}) {
  const [people, setPeople] = useState<Member[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const me = await currentUserId();
      setPeople(await activeMembers(me));
      setReady(true);
    })();
  }, []);

  if (!ready || people.length === 0) return null;

  return (
    <section className="space-y-6">
      <div>
        <SectionTitle>{title}</SectionTitle>
        <p className="-mt-2 text-sm text-[var(--color-muted)]">{lead}</p>
      </div>

      {people.length > 0 && (
        <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          {people.map((person) => (
            <li key={person.id}>
              <a
                href={memberHref(person.gh_login) ?? "#"}
                className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[rgba(163,145,224,0.04)]"
              >
                <Avatar
                  src={person.avatar_url}
                  name={person.shown_name}
                  accent={accentColor(person.accent)}
                  shape={person.avatar_shape}
                  size={34}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-sm text-[var(--color-text)]">
                      {person.shown_name}
                    </span>
                    {person.verified && <Verified size={13} />}
                  </span>
                  <span className="block truncate text-xs text-[var(--color-muted)]">
                    {person.post_count} post{person.post_count === 1 ? "" : "s"}{" "}
                    · {person.scan_count} scan
                    {person.scan_count === 1 ? "" : "s"}
                  </span>
                </span>
                <Icon
                  name="chevron"
                  size={15}
                  className="text-[var(--color-faint)]"
                />
              </a>
            </li>
          ))}
        </ul>
      )}

    </section>
  );
}
