'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import type { ApproxTotalView } from '@/lib/money/approx-total';
import { cn } from '@/lib/ui/cn';
import { Icon } from './icons';

/* Pixels between the figure and its breakdown, and kept clear at the screen's edges. */
const GAP = 8;
const EDGE = 8;

/**
 * A money total as one figure, with every exact amount behind it.
 *
 * The figure is the summary (`approxTotalView`); the breakdown is the truth,
 * in each token's own amount. It opens on hover where there is a pointer,
 * and on click or tap everywhere, because a phone has no hover and the
 * exact amounts must never be out of reach. Escape and a click elsewhere
 * close it.
 *
 * The breakdown opens in the top layer, placed against the figure, so a
 * panel or card that clips its contents (rounded stat strips do) never
 * cuts it off.
 *
 * A single amount with nothing behind it is just shown: there is nothing to
 * break down.
 */
export function MoneyTotal({ total, className }: { total: ApproxTotalView; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const figure = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => setOpen(true);
  const lines = total.counted.length + total.notCounted.length;

  /* Below the figure and from its left edge; above it when the screen ends first, and from its right edge when the panel would pass the side. */
  useLayoutEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    if (!el.matches(':popover-open')) el.showPopover?.();
    const place = () => {
      const box = figure.current?.getBoundingClientRect();
      if (!box) return;
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      const right = document.documentElement.clientWidth - EDGE;
      const bottom = window.innerHeight - EDGE;
      const left = box.left + width <= right ? box.left : box.right - width;
      const below = box.bottom + GAP;
      el.style.left = `${Math.max(EDGE, Math.min(left, right - width))}px`;
      el.style.top = `${below + height <= bottom || box.top - GAP - height < EDGE ? below : box.top - GAP - height}px`;
    };
    place();
    window.addEventListener('scroll', place, { capture: true, passive: true });
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
    };
  }, [open]);

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
        ref={figure}
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
          ref={panel}
          id={id}
          popover="manual"
          role="dialog"
          aria-label="Every amount behind this total"
          className="fixed inset-auto z-40 m-0 flex max-h-[calc(100dvh-1rem)] w-max min-w-[15rem] max-w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 overflow-y-auto rounded-[10px] border border-rule bg-raised p-3 text-left font-sans text-[13px] leading-snug tracking-normal text-ink shadow-lg"
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
