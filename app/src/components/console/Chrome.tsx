import type { ReactNode } from 'react';
import Icon, { type IconName } from '../Icon';

export function Blank({
  icon,
  title,
  lead,
  action,
}: {
  icon?: IconName;
  title: string;
  lead?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-line)] px-6 py-12 text-center">
      {icon && (
        <span className="mx-auto mb-4 grid size-11 place-items-center rounded-full border border-[var(--color-line)] text-[var(--color-faint)]">
          <Icon name={icon} size={20} />
        </span>
      )}
      <p className="text-base text-[var(--color-text)]">{title}</p>
      {lead && <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">{lead}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

function Shimmer({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-[var(--color-raised)] ${className}`} />;
}

export function FeedSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul
      className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]"
      aria-hidden="true"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex gap-4 px-5 py-4 sm:px-6">
          <Shimmer className="size-[38px] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Shimmer className="h-3 w-40" />
            <Shimmer className="h-4 w-full" />
            <Shimmer className="h-4 w-3/5" />
            <div className="flex gap-3 pt-1">
              <Shimmer className="h-3 w-10" />
              <Shimmer className="h-3 w-10" />
              <Shimmer className="h-3 w-10" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function BlockSkeleton({ height = 'h-32' }: { height?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] ${height}`}
      aria-hidden="true"
    />
  );
}
