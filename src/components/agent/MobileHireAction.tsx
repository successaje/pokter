'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/ui/cn';
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
  href,
  price,
  answeredNow,
  recommended,
  verdictLabel,
  evidenceLine,
}: {
  href: string;
  /** e.g. "0.10 $U" — the real escrow price, not a placeholder. */
  price: string;
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

  const label = recommended && answeredNow ? 'Hire agent' : 'Review & hire';
  const ctaClass =
    recommended && answeredNow
      ? 'action-primary w-full rounded-[var(--radius)] px-4 py-3 text-center text-sm'
      : 'w-full rounded-[var(--radius)] border border-[color:var(--caution)]/45 bg-[color:var(--caution-dim)] px-4 py-3 text-center text-sm font-medium text-[color:var(--caution)]';

  return (
    <>
      <div
        ref={cardRef}
        className="rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-4 lg:hidden"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-faint)]">
              Hire price
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

        <Link href={href} className={cn('mt-4 block', ctaClass)}>
          {label}
        </Link>

        {/*
          Dolphin's equivalent card says "Escrow Protected" and stops. The
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
          <Link
            href={href}
            tabIndex={showBar ? undefined : -1}
            className={cn(
              'shrink-0 rounded-[var(--radius)] px-4 py-2 text-center text-xs',
              recommended && answeredNow
                ? 'action-primary'
                : 'border border-[color:var(--caution)]/45 bg-[color:var(--caution-dim)] font-medium text-[color:var(--caution)]',
            )}
          >
            {label}
          </Link>
        </div>
      </div>
    </>
  );
}
