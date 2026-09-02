import type { ReactNode } from 'react';
import Icon from '../Icon';

export type Tone = 'good' | 'warn' | 'bad' | 'muted' | 'info';

const TONE_VAR: Record<Tone, string> = {
  good: 'var(--color-good)',
  warn: 'var(--color-warn)',
  bad: 'var(--color-bad)',
  muted: 'var(--color-muted)',
  info: 'var(--color-info)',
};

const TONE_TEXT: Record<Tone, string> = {
  good: 'text-[var(--color-good)]',
  warn: 'text-[var(--color-warn)]',
  bad: 'text-[var(--color-bad)]',
  muted: 'text-[var(--color-muted)]',
  info: 'text-[var(--color-info)]',
};

const TONE_CHIP: Record<Tone, string> = {
  good: 'border-[color-mix(in_srgb,var(--color-good)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-good)_12%,transparent)] text-[var(--color-good)]',
  warn: 'border-[color-mix(in_srgb,var(--color-warn)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warn)_12%,transparent)] text-[var(--color-warn)]',
  bad: 'border-[color-mix(in_srgb,var(--color-bad)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-bad)_12%,transparent)] text-[var(--color-bad)]',
  muted: 'border-[var(--color-line)] bg-transparent text-[var(--color-muted)]',
  info: 'border-[color-mix(in_srgb,var(--color-info)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-info)_12%,transparent)] text-[var(--color-info)]',
};

export function toneText(tone: Tone): string {
  return TONE_TEXT[tone];
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] ${className}`}
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
  return <h3 className="eyebrow mb-4">{children}</h3>;
}

export function Stats({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-2xs uppercase tracking-wider text-[var(--color-faint)]">
            {item.label}
          </dt>
          <dd className="mt-1 truncate text-lg tabular-nums text-[var(--color-text)]">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function KeyValues({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-[var(--color-line)]">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
          <dt className="shrink-0 text-[var(--color-muted)]">{item.label}</dt>
          <dd className="min-w-0 truncate text-right">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_CHIP[tone]}`}
    >
      {children}
    </span>
  );
}

export function ScoreRing({
  value,
  tone,
  size = 108,
}: {
  value: number;
  tone: Tone;
  size?: number;
}) {
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, value)) / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TONE_VAR[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className={`text-3xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</span>
      </div>
    </div>
  );
}

export function Score({ value, tone, caption }: { value: number; tone: Tone; caption: string }) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      <ScoreRing value={value} tone={tone} size={64} />
      <span className="text-2xs uppercase tracking-wider text-[var(--color-faint)]">{caption}</span>
    </div>
  );
}

export function Bar({ percent, tone = 'info' }: { percent: number; tone?: Tone }) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${width}%`, backgroundColor: TONE_VAR[tone] }}
      />
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line)]">
            {head.map((h) => (
              <th
                key={h}
                className="pb-2.5 pr-4 text-2xs font-semibold uppercase tracking-wider text-[var(--color-faint)]"
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
    <p className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-line)] px-4 py-7 text-center text-sm text-[var(--color-muted)]">
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
      className="inline-flex items-center gap-1.5 text-[var(--color-link)] underline-offset-[3px] hover:underline"
    >
      {children}
      <Icon name="external" size={13} />
    </a>
  );
}

const TONE_LABEL: Record<Tone, string> = {
  good: 'In good shape',
  warn: 'Worth attention',
  bad: 'Needs work',
  muted: 'Not enough to judge',
  info: 'For information',
};

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
  return (
    <section className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="rule-brand" />
      <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-6 px-6 py-6 sm:px-8 sm:py-7">
        <div className="min-w-0 max-w-2xl flex-1">
          <p
            className="text-2xs font-semibold uppercase tracking-[0.11em]"
            style={{ color: TONE_VAR[tone] }}
          >
            {TONE_LABEL[tone]}
          </p>
          <h2 className="mt-2 text-xl text-[var(--color-text)]">{headline}</h2>
          <p className="mt-2.5 text-sm text-[var(--color-muted)]">{summary}</p>
        </div>
        {score && (
          <div className="flex items-center gap-4">
            <ScoreRing value={score.value} tone={tone} />
            <div className="text-2xs uppercase tracking-wider text-[var(--color-faint)]">
              <span className="block">out of 100</span>
              <span className="mt-1 block font-mono normal-case tracking-normal text-[var(--color-muted)]">
                {score.caption}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
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
      <ol className="space-y-3.5">
        {items.map((item, i) => (
          <li key={item.key} className="flex gap-3.5 text-sm">
            <span
              className="mt-px grid size-5 shrink-0 place-items-center rounded-full border border-[var(--color-line-strong)] text-2xs font-semibold text-[var(--color-muted)]"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 text-[var(--color-text)]">{item.text}</span>
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
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
        <span className="inline-flex transition group-open:rotate-90">
          <Icon name="chevron" size={14} />
        </span>
        {summary}
      </summary>
      <div className="mt-5">{children}</div>
    </details>
  );
}

export function GoodList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2">
      {items.map((t) => (
        <li key={t} className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <Icon name="check" size={14} className="text-[var(--color-good)]" />
          {t}
        </li>
      ))}
    </ul>
  );
}
