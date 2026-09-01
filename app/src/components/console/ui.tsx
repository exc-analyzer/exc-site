import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] ${className}`}
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
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-line)] px-6 py-4">
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
    <dl className="divide-y divide-[var(--color-line)]">
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
  muted: 'border-[var(--color-line)] bg-transparent text-[var(--color-muted)]',
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
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
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
          <tr className="border-b border-[var(--color-line)]">
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
        <tbody className="divide-y divide-[var(--color-line)]">{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-[var(--color-line)] px-4 py-6 text-center text-sm text-[var(--color-muted)]">
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

export function Verdict({
  tone,
  headline,
  summary,
  score,
}: {
  tone: Tone;
  headline: string;
  summary: string;
  score?: { value: number; caption: string };
}) {
  const ring =
    tone === 'good'
      ? 'from-emerald-500/25'
      : tone === 'warn'
        ? 'from-amber-500/25'
        : tone === 'bad'
          ? 'from-red-500/25'
          : 'from-sky-500/20';
  return (
    <div
      className={`surface relative overflow-hidden bg-gradient-to-br ${ring} to-transparent p-6 sm:p-7`}
    >
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 max-w-xl">
          <h2 className={`text-lg font-bold ${TONE_TEXT[tone]}`}>{headline}</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">{summary}</p>
        </div>
        {score && (
          <div className="shrink-0 text-right">
            <div className={`text-4xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>
              {score.value}
              <span className="text-lg text-[var(--color-faint)]">/100</span>
            </div>
            <div className="text-xs text-[var(--color-muted)]">{score.caption}</div>
          </div>
        )}
      </div>
    </div>
  );
}
export function ActionList({
  title,
  items,
}: {
  title: string;
  items: { key: string; text: string; weight?: number }[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <ol className="space-y-3">
        {items.map((item, i) => (
          <li key={item.key} className="flex gap-3 text-sm">
            <span
              className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[var(--color-raised)] text-[11px] font-semibold text-[var(--color-muted)]"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">{item.text}</span>
            {item.weight !== undefined && (
              <span className="shrink-0 text-xs tabular-nums text-[var(--color-good)]">
                +{item.weight}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
export function Details({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs font-medium text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
        <span className="inline-block transition group-open:rotate-90">›</span> {summary}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
export function GoodList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((t) => (
        <li key={t} className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          <span className="text-[var(--color-good)]">✓</span>
          {t}
        </li>
      ))}
    </ul>
  );
}