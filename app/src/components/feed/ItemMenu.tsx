import { useEffect, useRef, useState } from 'react';
import { deletePost, type FeedItem as Item } from '../../lib/feed';
import { reportAbuse } from '../../lib/abuse';
import { SITE_URL } from '../../lib/site';
import Icon from '../Icon';

export default function ItemMenu({
  item,
  href,
  mine,
  signedIn,
  onEdit,
  onRemoved,
}: {
  item: Item;
  href: string;
  mine: boolean;
  signedIn: boolean;
  onEdit: () => void;
  onRemoved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function away(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

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
    setNote(problem ?? 'Report received. Thank you.');
    if (!problem) {
      setReporting(false);
      setReason('');
    }
  }

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

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-line-strong)] bg-[var(--color-raised)] shadow-[var(--shadow-lift)]"
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

          {mine && item.kind === 'post' && (
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

          {mine && item.kind === 'post' && !confirming && (
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
              <p className="text-xs text-[var(--color-muted)]">Delete this post for everyone?</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost px-3 py-1 text-xs text-[var(--color-bad)]"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  {busy ? 'Deleting…' : 'Delete'}
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
                  {busy ? 'Sending…' : 'Send'}
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

          {note && <p className="px-3 pb-2.5 text-xs text-[var(--color-muted)]">{note}</p>}
        </div>
      )}
    </div>
  );
}
