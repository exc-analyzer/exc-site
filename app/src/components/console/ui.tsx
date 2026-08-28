import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHead({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-4">
      <div className="min-w-0">
        <h2 className="truncate font-mono text-sm text-[var(--color-text)]">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-[var(--color-muted)]">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
      {children}
    </h3>
  );
}

export function Stats({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs text-[var(--color-muted)]">{item.label}</dt>
          <dd className="mt-0.5 truncate text-sm text-[var(--color-text)]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function KeyValues({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-[var(--color-border)]">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-4 py-2 text-sm">
          <dt className="shrink-0 text-[var(--color-muted)]">{item.label}</dt>
          <dd className="min-w-0 truncate text-right">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export type Tone = 'good' | 'warn' | 'bad' | 'muted' | 'info';

const TONE_TEXT: Record<Tone, string> = {
  good: 'text-emerald-400',
  warn: 'text-amber-400',
  bad: 'text-red-400',
  muted: 'text-[var(--color-muted)]',
  info: 'text-sky-400',
};

const TONE_CHIP: Record<Tone, string> = {
  good: 'border-emerald-900/70 bg-emerald-950/40 text-emerald-300',
  warn: 'border-amber-900/70 bg-amber-950/40 text-amber-300',
  bad: 'border-red-900/70 bg-red-950/40 text-red-300',
  muted: 'border-[var(--color-border)] bg-transparent text-[var(--color-muted)]',
  info: 'border-sky-900/70 bg-sky-950/40 text-sky-300',
};

export function toneText(tone: Tone): string {
  return TONE_TEXT[tone];
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs ${TONE_CHIP[tone]}`}
    >
      {children}
    </span>
  );
}

export function Score({ value, tone, caption }: { value: number; tone: Tone; caption: string }) {
  return (
    <div className="text-right">
      <div className={`text-3xl font-semibold tabular-nums ${TONE_TEXT[tone]}`}>
        {value}
        <span className="text-base text-[var(--color-muted)]">/100</span>
      </div>
      <div className={`text-sm ${TONE_TEXT[tone]}`}>{caption}</div>
    </div>
  );
}

export function Bar({ percent, tone = 'info' }: { percent: number; tone?: Tone }) {
  const width = Math.max(0, Math.min(100, percent));
  const fill =
    tone === 'good'
      ? 'bg-emerald-500'
      : tone === 'warn'
        ? 'bg-amber-500'
        : tone === 'bad'
          ? 'bg-red-500'
          : 'bg-sky-500';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function Table({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            {head.map((h) => (
              <th
                key={h}
                className="pb-2 pr-4 text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-[var(--color-border)] px-4 py-6 text-center text-sm text-[var(--color-muted)]">
      {children}
    </p>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sky-400 underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}
