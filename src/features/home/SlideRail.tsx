'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { Icon } from '@/ui/icons';

/**
 * A row of cards that runs off the right edge of the page, with arrows to
 * step along it: the heading on the left, the arrows level with it.
 *
 * The rail bleeds to the window's edge rather than the frame's, so the card
 * cut off at the edge says there are more without a dot or a count. Its
 * right padding is the same distance back, so the last card can still be
 * scrolled to sit inside the frame.
 */
export function SlideRail({ heading, label, children }: { heading: ReactNode; label: string; children: ReactNode }) {
  const rail = useRef<HTMLOListElement>(null);
  const [at, setAt] = useState<{ start: boolean; end: boolean }>({ start: true, end: false });

  /* Measured rather than counted, as in StepRail: cards per view change with the viewport. */
  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAt({ start: el.scrollLeft <= 4, end: el.scrollLeft >= max - 4 });
  }, []);

  useEffect(() => {
    measure();
    const el = rail.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const nudge = (direction: 1 | -1) => {
    const el = rail.current;
    if (!el) return;
    /*
     * Stepped from stop to stop rather than by a card's width. The stops are
     * where the cards snap — each card's start, and the end for the last —
     * so the scroll always lands on one and the snap never has to choose. By
     * a width, a step from the end landed between two stops and the snap
     * picked either.
     */
    const max = el.scrollWidth - el.clientWidth;
    const cards = Array.from(el.children) as HTMLElement[];
    const origin = cards[0]?.offsetLeft ?? 0;
    const stops = [...new Set(cards.map((card) => Math.min(max, card.offsetLeft - origin)))].sort((a, b) => a - b);
    const x = el.scrollLeft;
    const left = direction === 1 ? (stops.find((stop) => stop > x + 4) ?? max) : (stops.findLast((stop) => stop < x - 4) ?? 0);
    /* Asked, not assumed: a behaviour named in the call is one the reduced-motion stylesheet cannot reach. */
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left, behavior: still ? 'auto' : 'smooth' });
  };

  return (
    <>
      <div className="flex items-end justify-between gap-6">
        {heading}
        {/*
          Hidden from assistive tech: the rail is a focusable list that the
          arrow keys already scroll, so these repeat a control a keyboard
          has rather than adding one.
        */}
        <div className="hidden shrink-0 items-center gap-2 sm:flex" aria-hidden>
          {([-1, 1] as const).map((d) => {
            const done = d === -1 ? at.start : at.end;
            return (
              <button
                key={d}
                type="button"
                tabIndex={-1}
                onClick={() => nudge(d)}
                disabled={done}
                className="grid size-10 place-items-center rounded-full border border-rule-strong text-ink-2 transition-[opacity,border-color,color] hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-35"
              >
                {d === -1 ? <Icon.ChevronLeft size={17} /> : <Icon.ChevronRight size={17} />}
              </button>
            );
          })}
        </div>
      </div>
      <ol
        ref={rail}
        onScroll={measure}
        tabIndex={0}
        aria-label={label}
        /*
         * The last card snaps by its end, against a snapport inset by the
         * same bleed, so the rail's last stop is the end of its scroll and
         * the next arrow can switch off there. Snapped by its start, it
         * stopped short of the end and the arrow never did.
         *
         * The inset is written differently from the padding because its
         * percentages are not the same: padding's are the frame's width,
         * scroll padding's are the rail's own, and the rail is the frame
         * plus the bleed, so the bleed is `100vw - 100%` in its terms.
         */
        className="mr-[calc(50%-50vw)] mt-8 flex snap-x snap-mandatory scroll-pr-[calc(100vw-100%)] gap-5 overflow-x-auto pb-2 pr-[calc(50vw-50%)] [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink sm:mt-10 [&::-webkit-scrollbar]:hidden [&>li:last-child]:snap-end"
      >
        {children}
      </ol>
    </>
  );
}
