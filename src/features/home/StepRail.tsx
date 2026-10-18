'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { PAYMENT_TERMS } from '@/lib/erc8183/payment-terms';
import { Icon } from '@/ui/icons';

/**
 * The five hiring steps, as a rail of coloured cards.
 *
 * They were five equal cells of a bordered grid, which gave a buyer no
 * reason to read past the first: the one sentence that matters on this
 * section — you can stop before you fund — was carried by a small green
 * word in a corner, identical in weight on the cards it applied to and
 * the ones it did not.
 *
 * That sentence used to read "you can leave at any of the first three",
 * which this file contradicted three lines down: `Hire` is `free: false`
 * because it is where the escrow is funded. The heading offered a way out
 * at the step its own badge marks as the commitment.
 *
 * So each step is its own card now, and the rail scrolls. The last card
 * deliberately sits half off the right edge at most widths, because a row
 * that ends flush reads as complete and this one is not: "Review" is the
 * step people most need to reach and least expect to exist.
 */
const STEPS = [
  {
    step: 'Find',
    icon: Icon.Search,
    body: 'Describe the task in your words. Pokter reads it for intent and ranks measured agents against it.',
    free: true,
  },
  {
    step: 'Evaluate',
    icon: Icon.Eye,
    body: 'See what each agent claims, what Pokter observed, its signed price and what it needs from you.',
    free: true,
  },
  {
    step: 'Hire',
    icon: Icon.Lock,
    body: 'Confirm the job and fund one escrow. The agent can only be paid by delivering.',
    free: false,
  },
  {
    step: 'Receive',
    icon: Icon.Inbox,
    body: 'The agent delivers a file and commits its hash on chain. Pokter checks they match.',
    free: false,
  },
  {
    step: 'Review',
    icon: Icon.Shield,
    body: PAYMENT_TERMS.review,
    free: false,
  },
] as const;

export function StepRail() {
  const rail = useRef<HTMLOListElement>(null);
  const [at, setAt] = useState<{ start: boolean; end: boolean }>({ start: true, end: false });

  /*
   * Measured rather than counted. Cards-per-view changes with the
   * viewport, so tracking an index would have to know the breakpoints the
   * CSS already knows; scroll position does not.
   */
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
    const card = el.querySelector('li');
    const step = card ? card.getBoundingClientRect().width + 16 : el.clientWidth * 0.8;
    /*
     * Asked, not assumed. globals.css already forces `scroll-behavior:
     * auto` under `prefers-reduced-motion: reduce`, but that property does
     * not override a behavior named explicitly in a scroll call — so the
     * one path that animates on purpose is the one the stylesheet cannot
     * reach.
     */
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: step * direction, behavior: still ? 'auto' : 'smooth' });
  };

  return (
    <>
      <div className="mb-10 flex items-end justify-between gap-6">
        <div className="flex max-w-2xl flex-col gap-4">
          <span className="t-label">How hiring works</span>
          <h2 id="how-title" className="t-h1">
            Five steps, and you can stop before you fund.
          </h2>
        </div>
        {/*
          Hidden from assistive tech on purpose: the rail itself is a
          focusable, arrow-key-scrollable list, so these duplicate a
          control a keyboard already has rather than adding one.
        */}
        <div className="hidden shrink-0 items-center gap-2 sm:flex lg:hidden" aria-hidden>
          {([-1, 1] as const).map((d) => {
            const done = d === -1 ? at.start : at.end;
            return (
              <button
                key={d}
                type="button"
                tabIndex={-1}
                onClick={() => nudge(d)}
                disabled={done}
                className="grid size-10 place-items-center rounded-full border border-rule text-ink-2 transition-[opacity,border-color,color] hover:border-rule-strong hover:text-ink disabled:pointer-events-none disabled:opacity-35"
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
        aria-label="The five steps of a hire"
        /*
         * A rail only while it has to be one. At `lg` every step fits, so
         * it becomes a plain five-column grid: the bleed was meant to say
         * "there is more", and at 1440px it said it by hiding Review
         * completely and half of Receive — the two steps that explain what
         * happens to a buyer's money after they pay.
         */
        className="-mr-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink sm:-mr-7 lg:mr-0 lg:grid lg:grid-cols-5 lg:overflow-x-visible lg:pb-0 [&::-webkit-scrollbar]:hidden"
      >
        {STEPS.map((item, i) => (
          <li
            key={item.step}
            style={{ ['--fill' as string]: `var(--step-${i + 1})`, ['--on-fill' as string]: `var(--step-${i + 1}-ink)` }}
            className="flex min-h-[340px] w-[78vw] max-w-[380px] shrink-0 snap-start flex-col rounded-[18px] bg-[var(--fill)] p-6 text-[var(--on-fill)] sm:w-[46vw] sm:p-7 lg:min-h-[320px] lg:w-auto lg:max-w-none lg:p-5 xl:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-[11px] bg-[var(--on-fill)]/10">
                <item.icon size={19} />
              </span>
              {item.free && (
                <span className="rounded-full bg-[var(--on-fill)]/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]">
                  Free
                </span>
              )}
            </div>

            <h3 className="mt-5 text-[22px] font-semibold leading-tight tracking-[-0.02em]">{item.step}</h3>
            <p className="mt-2.5 text-[14px] leading-relaxed opacity-80">{item.body}</p>

            {/* The step number, as the card's own mark. */}
            <span
              aria-hidden
              className="t-readout mt-auto pt-8 text-[64px] font-medium leading-none tracking-[-0.04em] opacity-25"
            >
              {String(i + 1).padStart(2, '0')}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
