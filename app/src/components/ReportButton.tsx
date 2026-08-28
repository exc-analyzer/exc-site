import { useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Bildirme.
 *
 * Otomatik içerik denetimi sıfır bütçeyle güvenilir biçimde mümkün olmadığı
 * için asıl koruma bu: gördüğün bir şeyi bildirebiliyorsun, kaydı kim
 * hakkında olduğu ve kimin bildirdiği belli oluyor.
 *
 * Kimin kimi bildirdiği herkese açık değil — görünür olsaydı misilleme olurdu.
 */
export type AbuseTarget = 'avatar' | 'comment' | 'profile' | 'report';

export default function ReportButton({
  targetType,
  targetId,
  label = 'Bildir',
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
    if (!supabase || reason.trim().length < 3) return;
    setState('sending');

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      setState('error');
      setMessage('Bildirmek için giriş yapmalısın.');
      return;
    }

    const { error } = await supabase.from('abuse_reports').insert({
      target_type: targetType,
      target_id: targetId,
      reporter_id: userId,
      reason: reason.trim(),
    });

    if (error) {
      setState('error');
      // Ayni kisi ayni hedefi bir kez bildirebilir.
      setMessage(
        error.code === '23505' ? 'Bunu zaten bildirmiştin.' : error.message,
      );
      return;
    }

    setState('done');
    setMessage('Bildirimin alındı. Teşekkürler.');
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
        placeholder="Kısaca yaz: uygunsuz görsel, hakaret, spam…"
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void send()}
          disabled={reason.trim().length < 3 || state === 'sending'}
          className="btn btn-ghost"
        >
          {state === 'sending' ? 'Gönderiliyor…' : 'Gönder'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">
          Vazgeç
        </button>
        {message && <span className="text-xs text-[var(--color-bad)]">{message}</span>}
      </div>
    </div>
  );
}
