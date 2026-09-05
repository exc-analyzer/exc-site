import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deletePost, type FeedItem as Item } from "../../lib/feed";
import { reportAbuse } from "../../lib/abuse";
import { setReportVisibility } from "../../lib/reports";
import { myScansPublic } from "../../lib/profile";
import { amIModerator, removeAsModerator } from "../../lib/moderation";
import { SITE_URL } from "../../lib/site";
import Icon from "../Icon";

export default function ItemMenu({
  item,
  href,
  mine,
  signedIn,
  onEdit,
  onRemoved,
  onChanged,
}: {
  item: Item;
  href: string;
  mine: boolean;
  signedIn: boolean;
  onEdit: () => void;
  onRemoved: () => void;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editable, setEditable] = useState(
    () => Date.now() - new Date(item.happened_at).getTime() < 5 * 60 * 1000,
  );

  useEffect(() => {
    if (!editable) return;
    const left =
      5 * 60 * 1000 - (Date.now() - new Date(item.happened_at).getTime());
    if (left <= 0) {
      setEditable(false);
      return;
    }
    const timer = window.setTimeout(() => setEditable(false), left);
    return () => window.clearTimeout(timer);
  }, [editable, item.happened_at]);

  const [confirming, setConfirming] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ top: -9999, left: -9999 });
  const [visibility, setVisibility] = useState(item.visibility ?? "default");
  const [scansPublic, setScansPublic] = useState(true);
  const [moderator, setModerator] = useState(false);
  const [takingDown, setTakingDown] = useState(false);

  useEffect(() => {
    if (!signedIn || mine) return;
    void amIModerator().then(setModerator);
  }, [signedIn, mine]);

  async function takeDownNow() {
    setBusy(true);
    const trouble = await removeAsModerator(
      item.kind === "post" ? "post" : "report",
      item.id,
    );
    setBusy(false);
    if (trouble) {
      setNote(trouble);
      return;
    }
    setOpen(false);
    onRemoved();
  }

  useEffect(() => {
    if (!mine || item.kind !== "report") return;
    void myScansPublic().then(setScansPublic);
  }, [mine, item.kind]);

  const shown =
    visibility === "public" || (visibility === "default" && scansPublic);

  async function flipVisibility() {
    const next = shown ? "private" : "public";
    setBusy(true);
    const problem = await setReportVisibility(item.id, next);
    setBusy(false);
    if (problem) {
      setNote(problem);
      return;
    }
    setVisibility(next);
    setOpen(false);
    onChanged?.();
  }

  useEffect(() => {
    if (!open) return;
    function away(e: MouseEvent) {
      const target = e.target as Node;
      const insideTrigger = box.current?.contains(target) ?? false;
      const insideMenu = sheet.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    function place() {
      const trigger = box.current;
      const panel = sheet.current;
      if (!trigger) return;
      const t = trigger.getBoundingClientRect();
      const width = panel?.offsetWidth ?? 224;
      const height = panel?.offsetHeight ?? 0;
      const pad = 8;

      let left = t.right - width;
      left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));

      let top = t.bottom + 4;
      if (height > 0 && top + height > window.innerHeight - pad) {
        const above = t.top - height - 4;
        top = above >= pad ? above : Math.max(pad, window.innerHeight - height - pad);
      }
      setSpot({ top, left });
    }

    place();
    const again = () => place();
    window.addEventListener("scroll", again, true);
    window.addEventListener("resize", again);
    return () => {
      window.removeEventListener("scroll", again, true);
      window.removeEventListener("resize", again);
    };
  }, [open, reporting, note]);

  async function remove() {
    setBusy(true);
    const problem = await deletePost(item.id);
    setBusy(false);
    if (problem) {
      setNote(problem);
      return;
    }
    setOpen(false);
    onRemoved();
  }

  async function send() {
    setBusy(true);
    const problem = await reportAbuse(item.kind, item.id, reason);
    setBusy(false);
    setNote(problem ?? "Report received. Thank you.");
    if (!problem) {
      setReporting(false);
      setReason("");
    }
  }

  const menu = (
    <div
      role="menu"
      ref={sheet}
      style={{ top: spot.top, left: spot.left }}
      className="fixed z-[120] w-56 overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-line-strong)] bg-[var(--color-raised)] shadow-[var(--shadow-lift)]"
    >
          <button
            type="button"
            className="menu-item w-full text-left"
            onClick={() => {
              void navigator.clipboard.writeText(`${SITE_URL}${href}`);
              setOpen(false);
            }}
          >
            <Icon name="copy" size={15} />
            Copy link
          </button>

          {mine && item.kind === "post" && editable && (
            <button
              type="button"
              className="menu-item w-full text-left"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              <Icon name="pencil" size={15} />
              Edit
            </button>
          )}

          {mine && item.kind === "report" && (
            <button
              type="button"
              className="menu-item w-full text-left"
              disabled={busy}
              onClick={() => void flipVisibility()}
            >
              <Icon name="eye" size={15} />
              {shown
                ? "Hide my name on this scan"
                : "Show my name on this scan"}
            </button>
          )}

          {mine && item.kind === "post" && !confirming && (
            <button
              type="button"
              className="menu-item w-full text-left text-[var(--color-bad)]"
              onClick={() => setConfirming(true)}
            >
              <Icon name="trash" size={15} />
              Delete
            </button>
          )}

          {confirming && (
            <div className="border-t border-[var(--color-line)] px-3 py-2.5">
              <p className="text-xs text-[var(--color-muted)]">
                Delete this post for everyone?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost px-3 py-1 text-xs text-[var(--color-bad)]"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet px-3 py-1 text-xs"
                  onClick={() => setConfirming(false)}
                >
                  Keep
                </button>
              </div>
            </div>
          )}

          {moderator && !mine && !takingDown && (
            <button
              type="button"
              className="menu-item w-full text-left text-[var(--color-bad)]"
              onClick={() => setTakingDown(true)}
            >
              <Icon name="shield" size={15} />
              Take it down
            </button>
          )}

          {takingDown && (
            <div className="border-t border-[var(--color-line)] px-3 py-2.5">
              <p className="text-xs text-[var(--color-muted)]">
                {item.kind === "post"
                  ? "Hide this post from everyone?"
                  : "Hide this scan from everyone? The repository page drops it too."}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost px-3 py-1 text-xs text-[var(--color-bad)]"
                  disabled={busy}
                  onClick={() => void takeDownNow()}
                >
                  {busy ? "Removing…" : "Take it down"}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet px-3 py-1 text-xs"
                  onClick={() => setTakingDown(false)}
                >
                  Keep
                </button>
              </div>
            </div>
          )}

          {!mine && signedIn && !reporting && (
            <button
              type="button"
              className="menu-item w-full text-left"
              onClick={() => setReporting(true)}
            >
              <Icon name="flag" size={15} />
              Report
            </button>
          )}

          {reporting && (
            <div className="border-t border-[var(--color-line)] px-3 py-2.5">
              <textarea
                className="field resize-y text-xs"
                rows={2}
                maxLength={500}
                value={reason}
                placeholder="In a line: what is wrong with it?"
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost px-3 py-1 text-xs"
                  disabled={busy || reason.trim().length < 3}
                  onClick={() => void send()}
                >
                  {busy ? "Sending…" : "Send"}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet px-3 py-1 text-xs"
                  onClick={() => setReporting(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

      {note && (
        <p className="px-3 pb-2.5 text-xs text-[var(--color-muted)]">{note}</p>
      )}
    </div>
  );

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        aria-label="More"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full p-1.5 text-[var(--color-faint)] transition hover:bg-[rgba(163,145,224,0.08)] hover:text-[var(--color-text)]"
      >
        <span className="block leading-none">···</span>
      </button>
      {open && createPortal(menu, document.body)}
    </div>
  );
}
