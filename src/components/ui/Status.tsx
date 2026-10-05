import type { ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

export type StatusTone = 'neutral' | 'positive' | 'caution' | 'negative' | 'info' | 'brand';

const DOT: Record<StatusTone, string> = {
  neutral: 'bg-ink-faint',
  positive: 'bg-positive',
  caution: 'bg-caution',
  negative: 'bg-negative',
  info: 'bg-info',
  brand: 'bg-brand',
};
const TEXT: Record<StatusTone, string> = {
  neutral: 'text-ink-muted',
  positive: 'text-positive',
  caution: 'text-caution',
  negative: 'text-negative',
  info: 'text-info',
  brand: 'text-brand-strong',
};

/** A state as a dot and a word. Colour never carries it alone. */
export function Status({ tone = 'neutral', live = false, className, children }: { tone?: StatusTone; live?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-small font-medium', TEXT[tone], className)}>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT[tone], live && 'live-dot')} />
      {children}
    </span>
  );
}

/** A state as a small bordered tag, for rows and headers. */
export function Tag({ tone = 'neutral', className, children }: { tone?: StatusTone; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex h-5 items-center whitespace-nowrap rounded-sm border px-1.5 text-caption font-medium', tone === 'neutral' ? 'border-line text-ink-muted' : cn('border-transparent', TEXT[tone]), tone !== 'neutral' && `bg-${tone}-dim`, className)}>
      {children}
    </span>
  );
}
