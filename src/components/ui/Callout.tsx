import type { ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

export type CalloutTone = 'info' | 'caution' | 'negative' | 'positive' | 'neutral';

const TONE: Record<CalloutTone, { box: string; title: string }> = {
  info: { box: 'border-info/30 bg-info-dim', title: 'text-info' },
  caution: { box: 'border-caution/40 bg-caution-dim', title: 'text-caution' },
  negative: { box: 'border-negative/30 bg-negative-dim', title: 'text-negative' },
  positive: { box: 'border-positive/30 bg-positive-dim', title: 'text-positive' },
  neutral: { box: 'border-line bg-canvas-subtle', title: 'text-ink' },
};

/**
 * A bordered note with a tone. Negative callouts are announced as alerts;
 * everything else is read in place. The title is a sentence, not a label,
 * and the body is the one thing the reader should do or know.
 */
export function Callout({
  tone = 'neutral',
  title,
  className,
  children,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div role={tone === 'negative' ? 'alert' : undefined} className={cn('rounded-md border p-4', TONE[tone].box, className)}>
      {title && <p className={cn('text-body-s font-medium', TONE[tone].title)}>{title}</p>}
      {children && <div className={cn('flex flex-col gap-2 text-body-s leading-relaxed text-ink-secondary', title && 'mt-1.5')}>{children}</div>}
    </div>
  );
}
