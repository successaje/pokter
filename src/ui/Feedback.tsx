import type { ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';
import { Icon } from './icons';

type Tone = 'neutral' | 'info' | 'ok' | 'watch' | 'bad' | 'signal';

const TONE: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink border-rule',
  info: 'bg-info-wash text-ink border-[color-mix(in_oklab,var(--info)_25%,transparent)]',
  ok: 'bg-ok-wash text-ink border-[color-mix(in_oklab,var(--ok)_25%,transparent)]',
  watch: 'bg-watch-wash text-ink border-[color-mix(in_oklab,var(--watch)_30%,transparent)]',
  bad: 'bg-bad-wash text-ink border-[color-mix(in_oklab,var(--bad)_30%,transparent)]',
  signal: 'bg-signal-wash text-ink border-[color-mix(in_oklab,var(--signal)_45%,transparent)]',
};

const ICON_TONE: Record<Tone, string> = {
  neutral: 'text-ink-3',
  info: 'text-info',
  ok: 'text-ok',
  watch: 'text-watch',
  bad: 'text-bad',
  signal: 'text-ink',
};

/** An inline message. Not a toast: it stays where the problem is. */
export function Notice({
  tone = 'neutral',
  title,
  children,
  action,
  className,
  icon,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  const glyph =
    icon ??
    (tone === 'bad' || tone === 'watch' ? <Icon.Alert /> : tone === 'ok' ? <Icon.Check /> : <Icon.Info />);
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-[10px] border px-4 py-3 text-sm', TONE[tone], className)}
    >
      <span className={cn('mt-0.5 shrink-0', ICON_TONE[tone])}>{glyph}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="font-medium leading-snug">{title}</p>}
        {children && <div className="leading-relaxed text-ink-2">{children}</div>}
        {action && <div className="mt-1.5 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

/**
 * Empty and error states share one shape: what is (not) here, why, and the
 * one thing to do next. The mark is an instrument's empty readout, not an
 * illustration.
 */
export function EmptyState({
  title,
  children,
  action,
  className,
  tone = 'neutral',
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  tone?: 'neutral' | 'bad';
}) {
  return (
    <div className={cn('flex flex-col items-start gap-4 rounded-[14px] border border-dashed border-rule-strong px-6 py-10 sm:px-10', className)}>
      <span
        aria-hidden
        className={cn(
          'grid size-10 place-items-center rounded-[9px] border',
          tone === 'bad' ? 'border-bad/40 text-bad' : 'border-rule-strong text-ink-3',
        )}
      >
        {tone === 'bad' ? <Icon.Alert /> : <Icon.Dash />}
      </span>
      <div className="flex max-w-lg flex-col gap-1.5">
        <h3 className="t-h3">{title}</h3>
        {children && <div className="text-sm leading-relaxed text-ink-2">{children}</div>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('skeleton block', className)} />;
}

/** Announces loading to assistive tech while skeletons draw the shape. */
export function LoadingRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
