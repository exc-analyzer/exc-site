import { useEffect, useState } from "react";
import { loadBlocks, unblockPerson, type Blocked } from "../../lib/messages";
import { accentColor } from "../../lib/profile";
import { Avatar } from "./ProfileEditor";

export default function BlockedList() {
  const [rows, setRows] = useState<Blocked[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void loadBlocks().then(setRows);
  }, []);

  if (rows === null) {
    return (
      <p className="text-xs text-[var(--color-muted)]">Loading…</p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-[var(--color-muted)]">
        You have not blocked anybody. Blocking somebody drops the follow both
        ways, stops either of you writing, and takes you out of each other
        feeds.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--color-line)]">
      {rows.map((r) => (
        <li key={r.other_id} className="flex items-center gap-3 py-2.5">
          <Avatar
            src={r.avatar_url}
            name={r.shown_name}
            size={32}
            accent={accentColor(r.accent)}
            shape={r.avatar_shape}
          />
          <span className="min-w-0 flex-1">
            <a
              href={`/app/people/${r.gh_login}/`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {r.shown_name}
            </a>
            <span className="block truncate text-2xs text-[var(--color-faint)]">
              @{r.gh_login}
            </span>
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm shrink-0"
            disabled={busy === r.other_id}
            onClick={() => {
              setBusy(r.other_id);
              void unblockPerson(r.other_id).then(async () => {
                setRows(await loadBlocks());
                setBusy(null);
              });
            }}
          >
            {busy === r.other_id ? "Working…" : "Unblock"}
          </button>
        </li>
      ))}
    </ul>
  );
}
