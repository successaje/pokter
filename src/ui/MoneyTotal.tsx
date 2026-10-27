'use client';

import { useEffect, useId, useRef, useState } from 'react';

import type { ApproxTotalView } from '@/lib/money/approx-total';
import { cn } from '@/lib/ui/cn';
import { Icon } from './icons';

/**
 * A money total as one figure, with every exact amount behind it.
 *
 * The figure is the summary (`approxTotalView`); the breakdown is the truth,
 * in each token's own amount. It opens on hover where there is a pointer,
 * and on click or tap everywhere, because a phone has no hover and the
 * exact amounts must never be out of reach. Escape and a click elsewhere
 * close it.
 *
 * A single amount with nothing behind it is just shown: there is nothing to
 * break down.
 */
export function MoneyTotal({ total, className }: { total: ApproxTotalView; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Opens to the right of the figure, or to its left when the panel (at most 20rem) would pass the screen's edge. */
  const [alignEnd, setAlignEnd] = useState(false);
  const show = () => {
    const box = root.current?.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    setAlignEnd(Boolean(box && box.left + 20 * rem > document.documentElement.clientWidth - 8));
    setOpen(true);
  };
  const lines = total.counted.length + total.notCounted.length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  if (lines <= 1 && !total.approximate) return <span className={className}>{total.headline}</span>;

  /* Hover only for a mouse: a tap also fires pointer events, and must toggle rather than open twice. */
  const onEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    show();
  };
  const onLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <span ref={root} className="relative inline-flex" onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => (open ? setOpen(false) : show())}
        className={cn('inline-flex items-baseline gap-1 text-left underline decoration-dotted decoration-1 underline-offset-4', className)}
      >
        {total.headline}
        <Icon.ChevronDown size={14} className={cn('self-center text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden />
        <span className="sr-only">, show every amount</span>
      </button>
      {open && (
        <span
          id={id}
          role="dialog"
          aria-label="Every amount behind this total"
          className={cn('absolute top-full z-40', alignEnd ? 'right-0' : 'left-0', 'mt-2 flex w-max min-w-[15rem] max-w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 rounded-[10px] border border-rule bg-raised p-3 text-left font-sans text-[13px] leading-snug tracking-normal text-ink shadow-lg')}
        >
          {total.approximate && <span className="text-[12px] text-ink-3">Dollar stablecoins counted at $1 each. The exact amounts:</span>}
          {total.counted.length > 0 && (
            <span className="flex flex-col gap-1">
              {total.counted.map((line) => (
                <span key={line.key} className="flex items-baseline justify-between gap-4">
                  <span className="t-readout">{line.text}</span>
                  <span className="text-[12px] text-ink-3">{line.where}</span>
                </span>
              ))}
            </span>
          )}
          {total.notCounted.length > 0 && (
            <span className="flex flex-col gap-1 border-t border-rule pt-2">
              <span className="text-[12px] font-medium text-ink-3">Not counted</span>
              {total.notCounted.map((line) => (
                <span key={line.key} className="flex flex-col">
                  <span className="flex items-baseline justify-between gap-4">
                    <span className="t-readout">{line.text}</span>
                    <span className="text-[12px] text-ink-3">{line.where}</span>
                  </span>
                  <span className="text-[12px] text-ink-3">{line.why}</span>
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
