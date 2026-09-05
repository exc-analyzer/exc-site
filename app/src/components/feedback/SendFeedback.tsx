import { useEffect, useState } from "react";
import { sendFeedback, type FeedbackKind } from "../../lib/feedback";
import { probablySignedIn } from "../../lib/profile";
import { signInWithGitHub } from "../../lib/auth";
import Icon from "../Icon";

const KINDS: { id: FeedbackKind; label: string; hint: string }[] = [
  { id: "idea", label: "A request", hint: "Something you wish this did." },
  {
    id: "problem",
    label: "A complaint",
    hint: "Something is broken, or a result you think is unfair.",
  },
  {
    id: "other",
    label: "Something else",
    hint: "Anything that does not fit the other two.",
  },
];

export default function SendFeedback() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(probablySignedIn());
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const short = body.trim().length < 10;

  async function submit() {
    setBusy(true);
    setProblem(null);
    const trouble = await sendFeedback(kind, body);
    setBusy(false);
    if (trouble) {
      setProblem(trouble);
      return;
    }
    setSent(true);
    setBody("");
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => {
          if (!signedIn) {
            void signInWithGitHub();
            return;
          }
          setSent(false);
          setOpen(true);
        }}
      >
        <Icon name="reply" size={14} />
        Send feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[150] grid place-items-center bg-[rgba(8,7,14,0.8)] p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="surface w-full max-w-md p-5 text-left sm:p-6">
            {sent ? (
              <>
                <h2 className="text-base font-semibold">That reached us</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                  It is in the moderation queue now. We read everything, though we
                  cannot promise a reply to each one.
                </p>
                <div className="mt-5">
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => setOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-semibold">Send feedback</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">
                  A request, a complaint, or anything that is not working. It goes
                  straight to whoever is on moderation duty. To report one specific post
                  or comment, use the menu on that item instead.
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {KINDS.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setKind(entry.id)}
                      className={
                        kind === entry.id ? "nav-pill nav-pill-active" : "nav-pill"
                      }
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[var(--color-faint)]">
                  {KINDS.find((entry) => entry.id === kind)?.hint}
                </p>

                <textarea
                  className="mt-3 h-32 w-full resize-none rounded-[var(--radius-control)] border border-[var(--color-line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--color-line-active)] placeholder:text-[var(--color-faint)]"
                  value={body}
                  maxLength={2000}
                  placeholder="What happened, or what would you change?"
                  onChange={(e) => setBody(e.target.value)}
                />

                {problem && (
                  <p className="mt-2 text-sm text-[var(--color-bad)]">{problem}</p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || short}
                    onClick={() => void submit()}
                  >
                    {busy ? "Sending…" : "Send it"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </button>
                  <span className="ml-auto text-2xs text-[var(--color-faint)]">
                    {body.trim().length}/2000
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
