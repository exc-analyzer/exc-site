import { useEffect, useState } from "react";
import {
  amIModerator,
  loadFilings,
  loadSuppressed,
  loadVerified,
  settleFiling,
  setVerified,
  restoreAsModerator,
  suppressOwner,
  takeDown,
  unsuppressOwner,
  type Filing,
  type SuppressedOwner,
  type VerifiedMember,
} from "../../lib/moderation";
import { clearDispute, markDisputed } from "../../lib/reports";
import {
  loadFeedback,
  settleFeedback,
  type FeedbackEntry,
} from "../../lib/feedback";
import { relativeTime } from "../../engine/shared";
import { Blank, FeedSkeleton } from "../console/Chrome";
import Icon from "../Icon";
import Verified from "../Verified";
import { memberHref, searchMembers, type Member } from "../../lib/people";
import { accentColor } from "../../lib/profile";
import { Avatar } from "../profile/ProfileEditor";

type Standing = "asking" | "no" | "yes";
type Tab = "flagged" | "unlisted" | "inbox" | "verified";

export default function Queue() {
  const [standing, setStanding] = useState<Standing>("asking");
  const [filings, setFilings] = useState<Filing[] | null>(null);
  const [unlisted, setUnlisted] = useState<SuppressedOwner[] | null>(null);
  const [inbox, setInbox] = useState<FeedbackEntry[] | null>(null);
  const [ticked, setTicked] = useState<VerifiedMember[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("flagged");
  const [history, setHistory] = useState(false);

  async function refresh() {
    const [next, list, notes, marked] = await Promise.all([
      loadFilings(),
      loadSuppressed(),
      loadFeedback(),
      loadVerified(),
    ]);
    if (next === null || list === null || notes === null || marked === null) {
      setProblem("Could not reach the queue. Reload the page to try again.");
    }
    setFilings(next ?? []);
    setUnlisted(list ?? []);
    setInbox(notes ?? []);
    setTicked(marked ?? []);
  }

  useEffect(() => {
    void (async () => {
      const allowed = await amIModerator();
      setStanding(allowed ? "yes" : "no");
      if (allowed) await refresh();
    })();
  }, []);

  if (standing === "asking") return null;

  if (standing === "no") {
    return (
      <Blank
        icon="compass"
        title="No such page"
        lead="Nothing lives at this address."
        action={
          <a href="/app/" className="btn btn-quiet">
            Back to the feed
          </a>
        }
      />
    );
  }

  if (filings === null) return <FeedSkeleton rows={3} />;

  const open = filings.filter((f) => f.status === "open");
  const settled = filings.filter((f) => f.status !== "open");
  const onScreen = history ? settled : open;
  const inboxOpen = inbox?.filter((n) => n.status === "open") ?? [];
  const inboxDone = inbox?.filter((n) => n.status !== "open") ?? [];
  const inboxRows = inbox === null ? null : history ? inboxDone : inboxOpen;

  async function act(work: Promise<string | null>, id: string) {
    setBusy(id);
    setProblem(null);
    const trouble = await work;
    setBusy(null);
    if (trouble) {
      setProblem(trouble);
      return;
    }
    await refresh();
  }

  return (
    <div className="space-y-5">
      <header className="mb-2">
        <p className="eyebrow mb-3">Moderation</p>
        <h1 className="text-2xl">What people flagged</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Only the text that was reported is shown, with who reported it and why. Taking something
          down hides it for everyone and marks the filing as handled.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTab("flagged");
            setHistory(false);
          }}
          className={tab === "flagged" ? "nav-pill nav-pill-active" : "nav-pill"}
        >
          Flagged
          <span className="tabular-nums text-[var(--color-faint)]">{open.length}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("inbox");
            setHistory(false);
          }}
          className={tab === "inbox" ? "nav-pill nav-pill-active" : "nav-pill"}
        >
          Feedback
          <span className="tabular-nums text-[var(--color-faint)]">
            {inboxOpen.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("unlisted");
            setHistory(false);
          }}
          className={tab === "unlisted" ? "nav-pill nav-pill-active" : "nav-pill"}
        >
          Left out
          <span className="tabular-nums text-[var(--color-faint)]">
            {unlisted?.length ?? 0}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("verified");
            setHistory(false);
          }}
          className={tab === "verified" ? "nav-pill nav-pill-active" : "nav-pill"}
        >
          Verified
          <span className="tabular-nums text-[var(--color-faint)]">
            {ticked?.length ?? 0}
          </span>
        </button>
      </div>

      {tab !== "unlisted" && tab !== "verified" && (
        <div className="flex flex-wrap items-center gap-4 border-b border-[var(--color-line)] pb-2.5 text-sm">
          <button
            type="button"
            onClick={() => setHistory(false)}
            className={
              history
                ? "text-[var(--color-faint)] hover:text-[var(--color-muted)]"
                : "font-medium text-[var(--color-text)]"
            }
          >
            Waiting on you
          </button>
          <button
            type="button"
            onClick={() => setHistory(true)}
            className={
              history
                ? "font-medium text-[var(--color-text)]"
                : "text-[var(--color-faint)] hover:text-[var(--color-muted)]"
            }
          >
            History
            <span className="ml-1.5 tabular-nums text-[var(--color-faint)]">
              {tab === "inbox" ? inboxDone.length : settled.length}
            </span>
          </button>
        </div>
      )}

      {problem && <p className="text-xs text-[var(--color-bad)]">{problem}</p>}

      {tab === "verified" ? (
        <VerifiedPanel
          rows={ticked}
          busy={busy}
          onMark={(login) => act(setVerified(login, true), `mark:${login}`)}
          onUnmark={(login) => act(setVerified(login, false), `unmark:${login}`)}
        />
      ) : tab === "inbox" ? (
        <Inbox
          rows={inboxRows}
          history={history}
          busy={busy}
          onSettle={(id, verdict) => act(settleFeedback(id, verdict), `note:${id}`)}
        />
      ) : tab === "unlisted" ? (
        <LeftOut
          rows={unlisted}
          busy={busy}
          onAdd={(login, why) => act(suppressOwner(login, why), `add:${login}`)}
          onRemove={(login) => act(unsuppressOwner(login), `off:${login}`)}
        />
      ) : onScreen.length === 0 ? (
        <Blank
          icon="check"
          title={history ? "Nothing settled yet" : "Nothing waiting"}
          lead={
            history
              ? "Filings you have acted on show up here."
              : "When somebody reports a comment or a post, it lands here."
          }
        />
      ) : (
        <ul className="space-y-3">
          {onScreen.map((filing) => (
            <li key={filing.id} className="surface p-5">
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--color-muted)]">
                <span className="font-medium text-[var(--color-text)]">
                  {filing.target_type}
                </span>
                {filing.author_login && (
                  <span className="font-mono">by @{filing.author_login}</span>
                )}
                <span>· reported by @{filing.reported_by}</span>
                <span>· {relativeTime(filing.created_at)}</span>
                {filing.gone && (
                  <span className="text-[var(--color-good)]">· already taken down</span>
                )}
                {filing.status !== "open" && <span>· {filing.status}</span>}
              </div>

              <p className="mt-3 rounded-[var(--radius-control)] border border-[var(--color-line)] px-3.5 py-2.5 text-sm [overflow-wrap:anywhere]">
                {filing.body ?? "This one has no text to show."}
              </p>

              <p className="mt-3 text-sm">
                <span className="text-[var(--color-faint)]">Reason given: </span>
                <span className="[overflow-wrap:anywhere]">{filing.reason}</span>
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {!filing.gone && (
                  <ConfirmButton
                    label="Take it down"
                    icon="trash"
                    question={`Hide this ${filing.target_type} for everyone?`}
                    confirmLabel="Yes, take it down"
                    busy={busy === filing.id}
                    onConfirm={() => void act(takeDown(filing.id), filing.id)}
                  />
                )}
                {filing.gone && filing.recoverable && (
                  <ConfirmButton
                    label="Put it back"
                    icon="reply"
                    question={`Show this ${filing.target_type} again, with what it originally said?`}
                    confirmLabel="Yes, put it back"
                    busy={busy === `back:${filing.id}`}
                    onConfirm={() =>
                      void act(
                        restoreAsModerator(filing.target_type, filing.target_id),
                        `back:${filing.id}`,
                      )
                    }
                  />
                )}
                {filing.target_type === "report" && !filing.gone && (
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    disabled={busy === filing.id}
                    onClick={() =>
                      void act(
                        filing.disputed
                          ? clearDispute(filing.target_id)
                          : markDisputed(filing.target_id, filing.reason),
                        filing.id,
                      )
                    }
                  >
                    <Icon name="flag" size={14} />
                    {filing.disputed ? "Clear the dispute" : "Flag as disputed"}
                  </button>
                )}
                {filing.subject_owner && (
                  <LeaveOutButton
                    login={filing.subject_owner}
                    busy={busy === `add:${filing.subject_owner}`}
                    onConfirm={() =>
                      void act(
                        suppressOwner(filing.subject_owner!, `Asked via filing ${filing.id}`),
                        `add:${filing.subject_owner}`,
                      )
                    }
                  />
                )}
                {filing.status === "open" ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      disabled={busy === filing.id}
                      onClick={() => void act(settleFiling(filing.id, "dismissed"), filing.id)}
                    >
                      Nothing wrong here
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      disabled={busy === filing.id}
                      onClick={() => void act(settleFiling(filing.id, "reviewed"), filing.id)}
                    >
                      Mark as handled
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    disabled={busy === filing.id}
                    onClick={() => void act(settleFiling(filing.id, "open"), filing.id)}
                  >
                    Put it back in the queue
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConfirmButton({
  label,
  icon,
  question,
  confirmLabel,
  busy,
  onConfirm,
}: {
  label: string;
  icon: "trash" | "eye" | "reply";
  question: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm text-[var(--color-bad)]"
        disabled={busy}
        onClick={() => setAsking(true)}
      >
        <Icon name={icon} size={14} />
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-xs text-[var(--color-muted)]">{question}</span>
      <button
        type="button"
        className="btn btn-ghost btn-sm text-[var(--color-bad)]"
        disabled={busy}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        onClick={() => setAsking(false)}
      >
        Cancel
      </button>
    </span>
  );
}

function LeaveOutButton({
  login,
  busy,
  onConfirm,
}: {
  login: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        disabled={busy}
        onClick={() => setAsking(true)}
      >
        <Icon name="eye" size={14} />
        Leave @{login} out
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="btn btn-ghost btn-sm text-[var(--color-bad)]"
        disabled={busy}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        Drop every scan of @{login}
      </button>
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        onClick={() => setAsking(false)}
      >
        Cancel
      </button>
    </span>
  );
}

function LeftOut({
  rows,
  busy,
  onAdd,
  onRemove,
}: {
  rows: SuppressedOwner[] | null;
  busy: string | null;
  onAdd: (login: string, why: string | null) => void;
  onRemove: (login: string) => void;
}) {
  const [login, setLogin] = useState("");
  const [why, setWhy] = useState("");

  const handle = login.trim().replace(/^@/, "");

  return (
    <div className="space-y-5">
      <div className="surface p-5">
        <h2 className="text-sm font-semibold">Leave an account out</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">
          Use this when a GitHub account asks not to appear here. Their published scans are
          deleted and no new one can be saved under their name. It does not touch anything they
          wrote themselves.
        </p>
        <form
          className="mt-4 space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!handle) return;
            onAdd(handle, why.trim() || null);
            setLogin("");
            setWhy("");
          }}
        >
          <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-line)] px-3 py-2 focus-within:border-[var(--color-line-active)]">
            <span className="text-sm text-[var(--color-faint)]">@</span>
            <input
              className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-[var(--color-faint)] placeholder:font-sans"
              value={login}
              placeholder="GitHub account name"
              onChange={(e) => setLogin(e.target.value)}
            />
          </div>
          <input
            className="w-full rounded-[var(--radius-control)] border border-[var(--color-line)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-line-active)] placeholder:text-[var(--color-faint)]"
            value={why}
            placeholder="Why, for the record — optional"
            onChange={(e) => setWhy(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-ghost btn-sm"
            disabled={!handle || busy === `add:${handle}`}
          >
            <Icon name="check" size={14} />
            Leave them out
          </button>
        </form>
      </div>

      {rows === null ? (
        <FeedSkeleton rows={2} />
      ) : rows.length === 0 ? (
        <Blank
          icon="users"
          title="Nobody is left out"
          lead="Accounts that asked to stay off the site would be listed here."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.gh_login} className="surface flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <a
                  href={`https://github.com/${row.gh_login}`}
                  className="font-mono text-sm hover:underline"
                >
                  @{row.gh_login}
                </a>
                <p className="mt-1 text-xs text-[var(--color-muted)] [overflow-wrap:anywhere]">
                  {row.reason ?? "No reason recorded."}
                </p>
                <p className="mt-1 text-2xs text-[var(--color-faint)]">
                  {relativeTime(row.created_at)}
                  {row.added_by && ` · by @${row.added_by}`}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy === `off:${row.gh_login}`}
                onClick={() => onRemove(row.gh_login)}
              >
                Put back
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  idea: "A request",
  problem: "A complaint",
  other: "Something else",
};

function Inbox({
  rows,
  history,
  busy,
  onSettle,
}: {
  rows: FeedbackEntry[] | null;
  history: boolean;
  busy: string | null;
  onSettle: (id: string, verdict: "open" | "done") => void;
}) {
  if (rows === null) return <FeedSkeleton rows={2} />;
  if (rows.length === 0) {
    return (
      <Blank
        icon="reply"
        title={history ? "Nothing handled yet" : "Nobody has written in"}
        lead={
          history
            ? "Notes you have marked as handled show up here."
            : "Requests and complaints sent from the feed land here."
        }
      />
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((note) => (
        <li key={note.id} className="surface p-5">
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--color-muted)]">
            <span className="font-medium text-[var(--color-text)]">
              {KIND_LABEL[note.kind] ?? note.kind}
            </span>
            {note.author_login && <span className="font-mono">by @{note.author_login}</span>}
            <span>· {relativeTime(note.created_at)}</span>
            {note.status === "done" && (
              <span className="text-[var(--color-good)]">· handled</span>
            )}
          </div>

          <p className="mt-3 whitespace-pre-wrap rounded-[var(--radius-control)] border border-[var(--color-line)] px-3.5 py-2.5 text-sm [overflow-wrap:anywhere]">
            {note.body}
          </p>

          <div className="mt-4">
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy === `note:${note.id}`}
              onClick={() => onSettle(note.id, note.status === "open" ? "done" : "open")}
            >
              {note.status === "open" ? "Mark as handled" : "Put it back"}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function VerifiedPanel({
  rows,
  busy,
  onMark,
  onUnmark,
}: {
  rows: VerifiedMember[] | null;
  busy: string | null;
  onMark: (login: string) => void;
  onUnmark: (login: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<Member[]>([]);
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    const wanted = term.trim().replace(/^@/, "");
    if (wanted.length < 2) {
      setFound([]);
      setLooking(false);
      return;
    }
    let alive = true;
    setLooking(true);
    const timer = window.setTimeout(() => {
      void searchMembers(wanted, 6).then((people) => {
        if (!alive) return;
        setFound(people);
        setLooking(false);
      });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [term]);

  const already = new Set((rows ?? []).map((r) => r.gh_login.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="surface p-5">
        <h2 className="text-sm font-semibold">Mark an account as verified</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">
          A verified account gets a blue tick beside its name, everywhere the name appears. That
          is all it does. It grants no extra permissions, changes nothing about what the account
          may post, and gives it no special place anywhere on the site.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-line)] px-3 py-2 focus-within:border-[var(--color-line-active)]">
          <Icon name="search" size={14} className="text-[var(--color-faint)]" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-faint)]"
            value={term}
            placeholder="Find somebody by name or GitHub account"
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>

        {term.trim().length >= 2 && (
          <div className="mt-3">
            {looking ? (
              <p className="text-xs text-[var(--color-faint)]">Looking</p>
            ) : found.length === 0 ? (
              <p className="text-xs text-[var(--color-faint)]">
                Nobody here goes by that.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-line)]">
                {found.map((person) => {
                  const on = already.has(person.gh_login.toLowerCase());
                  return (
                    <li
                      key={person.id}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <Avatar
                        src={person.avatar_url}
                        name={person.shown_name}
                        accent={accentColor(person.accent)}
                        shape={person.avatar_shape}
                        size={30}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1">
                          <span className="truncate text-sm">
                            {person.shown_name}
                          </span>
                          {on && <Verified size={13} />}
                        </span>
                        <span className="block truncate font-mono text-xs text-[var(--color-muted)]">
                          @{person.gh_login}
                        </span>
                      </span>
                      {on ? (
                        <span className="shrink-0 text-xs text-[var(--color-faint)]">
                          Already verified
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm shrink-0"
                          disabled={busy === `mark:${person.gh_login}`}
                          onClick={() => {
                            onMark(person.gh_login);
                            setTerm("");
                          }}
                        >
                          <Icon name="check" size={13} />
                          Verify
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {rows === null ? (
        <FeedSkeleton rows={2} />
      ) : rows.length === 0 ? (
        <Blank
          icon="users"
          title="Nobody is verified yet"
          lead="Find an account above and mark it, and it shows up here."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="surface flex flex-wrap items-center gap-3 p-4"
            >
              <Avatar
                src={row.avatar_url}
                name={row.shown_name}
                accent={accentColor(row.accent)}
                size={34}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5">
                  <span className="truncate text-sm">{row.shown_name}</span>
                  <Verified size={14} />
                </p>
                <a
                  href={memberHref(row.gh_login) ?? "#"}
                  className="block truncate font-mono text-xs text-[var(--color-muted)] hover:underline"
                >
                  @{row.gh_login}
                </a>
              </div>
              <button
                type="button"
                className="btn btn-quiet btn-sm shrink-0"
                disabled={busy === `unmark:${row.gh_login}`}
                onClick={() => onUnmark(row.gh_login)}
              >
                Take it back
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
