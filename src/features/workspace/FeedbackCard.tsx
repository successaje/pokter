import type { ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

/*
 * The frame both halves of "How did the agent do?" share: which audience
 * the card is for, first and in the same place on each, because the one
 * thing a buyer must not mix up is what is published and what is not.
 */
export function FeedbackCard({ kind, icon, title, lede, children, className }: {
  kind: string;
  icon: ReactNode;
  title: string;
  lede: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col rounded-[16px] border border-rule bg-raised', className)}>
      <header className="flex flex-col gap-1 px-5 pt-5">
        <span className="mb-2 inline-flex items-center gap-1.5 self-start rounded-full border border-rule bg-sunken px-2.5 py-1 text-ink-2">
          {icon}
          <span className="t-label">{kind}</span>
        </span>
        <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h3>
        <p className="text-[13px] leading-snug text-ink-3">{lede}</p>
      </header>
      {children}
    </div>
  );
}
