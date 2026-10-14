'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';

/**
 * Secondary actions behind one "⋯" button.
 *
 * The agent page put Save, Follow, Share and Compare in a row of equal
 * buttons above the agent's description, so on a phone four controls came
 * before the reader learned what the agent does. The actions people use to
 * keep track of an agent stay visible; the occasional ones live here.
 * Closes on Escape or a click outside; it stays open after an action so a
 * confirmation such as "Link copied" can be read.
 */
export function MoreActions({ children, label = 'More actions', className }: { children: ReactNode; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-rule-strong bg-raised text-ink-2 transition-colors hover:border-ink hover:text-ink',
          open && 'border-ink text-ink',
        )}
      >
        <Icon.More size={18} />
      </button>
      {open && (
        <div
          id={menuId}
          role="group"
          aria-label={label}
          className="absolute left-0 top-full z-30 mt-2 lg:left-auto lg:right-0 flex min-w-44 flex-col overflow-hidden rounded-[10px] border border-rule bg-raised p-1 shadow-lift"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Classes that turn an action button into a menu row. */
export const menuRow = 'h-9 w-full justify-start rounded-[7px] border-0 bg-transparent px-2.5 text-[13px] font-medium text-ink-2 hover:bg-sunken hover:text-ink';
