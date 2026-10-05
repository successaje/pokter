'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { HireButton } from '@/components/hire/HireDrawer';
import { PAYMENT_VALUE_NOTE } from '@/lib/network/presentation';

/**
 * The hire decision on a phone: a card at the top of the dossier, and the
 * sticky bar that takes over once that card scrolls away.
 *
 * They are one component because they are one control. Rendering both at once
 * would put two primary actions on screen competing for the same tap, so the
 * bar is observed into view only when the card leaves — the user always has
 * exactly one obvious next action, wherever they are on the page.
 *
 * Everything here is below `lg`, matching the breakpoint the sticky bar
 * already used. The desktop dossier keeps its own sidebar CTA untouched.
 */
export function MobileHireAction({
  price,
  priceCaption,
  answeredNow,
  recommended,
  verdictLabel,
  evidenceLine,
}: {
  /** e.g. "0.10 $U" — the real escrow price, not a placeholder. */
  price: string;
  /*
   * What that figure is. A price the agent signed and a budget the buyer
   * sets are different quantities, and calling both "Hire price" told
   * somebody an agent charges 0.10 $U when it had never named a price at
   * all. The rail beside this on desktop already made the distinction; this
   * card is the only thing a phone sees, so it has to make it too.
   */
  priceCaption: string;
  answeredNow: boolean;
  recommended: boolean;
  verdictLabel: string;
  /** One measured line, so the CTA is never the only thing above the fold. */
  evidenceLine: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    /*
     * A passive scroll listener rather than an IntersectionObserver. Both work
     * here, but an observer delivers nothing while a tab is hidden, which made
     * the handoff impossible to verify — and a control that guards a payment
     * should not be shipped on the strength of an argument that it ought to
     * work. This reads one rect for one element per scroll, which is cheap,
     * and `passive` keeps it off the scrolling critical path.
     */
    const update = () => {
      const { bottom } = card.getBoundingClientRect();
      setShowBar(bottom < 72);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  /*
   * Tell the navigation to stand down while this bar is up.
   *
   * Both are fixed to the bottom on a phone, and together they took 133px of
   * a 900px viewport — two stacked bars, at the moment the reader is deciding
   * whether to spend money. Only one of them is about that decision.
   *
   * Through an attribute on <body> rather than shared state, because the nav
   * lives in the shell and this lives in a page: a context threaded between
   * them for one boolean would be a larger change than the problem.
   */
  useEffect(() => {
    document.body.toggleAttribute('data-hire-bar', showBar);
    return () => document.body.removeAttribute('data-hire-bar');
  }, [showBar]);

  const label = recommended && answeredNow ? 'Hire agent' : 'Review & hire';
  /*
   * The drawer's own button carries the look, so the tone is all this needs
   * to decide. Keeping a parallel set of classes here would mean two places
   * deciding what a cautioned hire looks like, and they would drift.
   */
  const ctaVariant = recommended && answeredNow ? 'primary' : 'caution';

  return (
    <>
      <div
        ref={cardRef}
        className="rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-4 lg:hidden"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-faint)]">
              {priceCaption}
            </p>
            <p className="tabular mt-1 text-2xl font-semibold leading-none">
              {price}
            </p>
            {PAYMENT_VALUE_NOTE && (
              <p className="mt-1 text-[11px] text-[color:var(--text-faint)]">
                {PAYMENT_VALUE_NOTE}
              </p>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
            <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-none stroke-current" strokeWidth="1.8">
              <path d="M12 3l7 4v5c0 4-3 7-7 9-4-2-7-5-7-9V7z" />
            </svg>
            Held in escrow
          </span>
        </div>

        <HireButton block size="lg" variant={ctaVariant} className="mt-4">
          {label}
        </HireButton>

        {/*
          A badge saying the escrow is protected stops at the mechanism. The
          line below is the difference: what Pokter actually observed, stated
          where the money decision is made rather than four screens down.
        */}
        <p className="mt-3 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
          <span
            className={
              answeredNow
                ? 'font-medium text-[color:var(--positive)]'
                : 'font-medium text-[color:var(--negative)]'
            }
          >
            {verdictLabel}
          </span>
          {' · '}
          {evidenceLine}
        </p>
      </div>

      <div
        aria-hidden={!showBar}
        className={cn(
          'hire-action-bar fixed inset-x-0 z-30 border-t border-[color:var(--border-strong)] bg-[color:var(--bg)]/95 p-3 shadow-[0_-12px_32px_rgba(0,0,0,0.18)] backdrop-blur-md transition-[opacity,transform] duration-200 lg:hidden',
          showBar
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-2 opacity-0',
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium">{price} · ERC-8183</p>
            <p
              className={
                answeredNow
                  ? 'truncate text-[10px] text-[color:var(--positive)]'
                  : 'truncate text-[10px] text-[color:var(--negative)]'
              }
            >
              {answeredNow ? 'Live check passed' : 'Live check failed'}
            </p>
          </div>
          <HireButton
            size="sm"
            variant={ctaVariant}
            className={cn('shrink-0', !showBar && 'pointer-events-none')}
          >
            {label}
          </HireButton>
        </div>
      </div>
    </>
  );
}
