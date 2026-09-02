import { useState } from 'react';
import { reportAbuse, type AbuseTarget } from '../lib/abuse';

export type { AbuseTarget };
export default function ReportButton({
  targetType,
  targetId,
  label = 'Report',
}: {
  targetType: AbuseTarget;
  targetId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  async function send() {
    setState('sending');
    const problem = await reportAbuse(targetType, targetId, reason);
    if (problem) {
      setState('error');
      setMessage(problem);
      return;
    }
    setState('done');
    setMessage('Report received. Thank you.');
  }
  if (state === 'done') {
    return <span className="text-xs text-[var(--color-good)]">{message}</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-[var(--color-muted)] transition hover:text-[var(--color-bad)]"
      >
        {label}
      </button>
    );
  }
  return (
    <div className="mt-2 w-full space-y-2 rounded-[var(--radius-control)] border border-[var(--color-line)] p-3">
      <label className="label" htmlFor={`reason-${targetId}`}>
        Neyi bildiriyorsun?
      </label>
      <input
        id={`reason-${targetId}`}
        className="field"
        value={reason}
        maxLength={500}
        placeholder="In a line: abusive image, insult, spam…"
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void send()}
          disabled={reason.trim().length < 3 || state === 'sending'}
          className="btn btn-ghost"
        >
          {state === 'sending' ? 'Sending…' : 'Send'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">
          Cancel
        </button>
        {message && <span className="text-xs text-[var(--color-bad)]">{message}</span>}
      </div>
    </div>
  );
}