'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { CountUp } from '@/features/landing/CountUp';
import type { TickerItem } from '@/lib/landing/sheet';
import { cn } from '@/lib/ui/cn';

/**
 * What happened recently, as one row that moves.
 *
 * Carried over from the landing rebuild (feat/landing-rebuild). Calls that
 * went out and whether they came back, escrows funded, delivered, settled or
 * returned — misses included, because they are most of the record. Two
 * figures sit in the row as cells of their own. It moves only where moving
 * is welcome: a hover or focus holds it, the button stops it, and on a touch
 * screen or under reduced motion it is a row to swipe instead.
 */

const DOT = {
  proven: 'bg-ok',
  ok: 'bg-ok',
  watch: 'bg-watch',
  info: 'bg-info',
  bad: 'bg-bad',
  none: 'bg-rule-strong',
} as const;

/** Seconds each entry is on screen; the row's speed is set by its length. */
const PER_ITEM = 5.5;

function when(at: string) {
  const mins = Math.round((Date.now() - Date.parse(at)) / 60000);
  if (!Number.isFinite(mins)) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Item({ item }: { item: TickerItem }) {
  const body = (
    <>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT[item.tone])} />
      <span className="truncate text-[12.5px] text-ink-2 group-hover:text-ink">{item.text}</span>
      <span className="t-readout shrink-0 text-[11px] text-ink-3" suppressHydrationWarning>
        {when(item.at)}
      </span>
    </>
  );
  const cell = 'group flex min-w-0 max-w-[24rem] items-center gap-2.5 border-r border-rule px-5 py-4';
  return (
    <li className="flex shrink-0">
      {item.href ? (
        <Link href={item.href} className={cn(cell, 'transition-colors hover:bg-raised')}>
          {body}
        </Link>
      ) : (
        <span className={cell}>{body}</span>
      )}
    </li>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <li className="flex shrink-0">
      <span className="flex flex-col justify-center gap-0.5 border-r border-rule bg-paper px-6 py-3">
        <CountUp value={value} className="t-readout text-[19px] font-medium tracking-[-0.03em] text-ink" />
        <span className="text-[11px] text-ink-3">{label}</span>
      </span>
    </li>
  );
}

export function LiveTicker({ items, registered, delivered }: { items: TickerItem[]; registered: number | null; delivered: number }) {
  const [held, setHeld] = useState(false);
  /* Touch screens and reduced motion get a row to swipe; everyone else a row that moves. */
  const [push, setPush] = useState(true);
  useEffect(() => {
    const coarse = window.matchMedia?.('(pointer: coarse)');
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const read = () => setPush(Boolean(coarse?.matches) || Boolean(still?.matches));
    read();
    coarse?.addEventListener('change', read);
    still?.addEventListener('change', read);
    return () => {
      coarse?.removeEventListener('change', read);
      still?.removeEventListener('change', read);
    };
  }, []);

  if (items.length === 0) return null;

  const row: Array<{ kind: 'item'; item: TickerItem } | { kind: 'stat'; value: number; label: string }> = [];
  items.forEach((item, i) => {
    row.push({ kind: 'item', item });
    if (i === 3 && registered !== null) row.push({ kind: 'stat', value: registered, label: 'registered on BNB Chain' });
    if (i === 12) row.push({ kind: 'stat', value: delivered, label: 'paid jobs answered for outside buyers' });
  });

  const seconds = row.length * PER_ITEM;
  const moving = !push;

  const list = (hidden = false) => (
    <ul
      aria-hidden={hidden || undefined}
      aria-label={hidden ? undefined : 'Recent calls and escrow activity'}
      className={cn('flex', moving && 'ticker-run')}
      style={moving ? { animationDuration: `${seconds}s`, animationPlayState: held ? 'paused' : 'running' } : undefined}
    >
      {row.map((entry, i) =>
        entry.kind === 'item' ? (
          <Item key={hidden ? `c-${entry.item.key}` : entry.item.key} item={entry.item} />
        ) : (
          <Stat key={`${hidden ? 'c-' : ''}stat-${i}`} value={entry.value} label={entry.label} />
        ),
      )}
    </ul>
  );

  return (
    <section className="relative z-[1] border-y border-rule bg-raised/60" aria-label="Recent activity">
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-paper to-transparent sm:w-24" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-paper to-transparent sm:w-24" />
      <div
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocusCapture={() => setHeld(true)}
        onBlurCapture={() => setHeld(false)}
        className={cn(moving ? 'overflow-hidden' : 'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden')}
      >
        <div className="flex w-max">
          {list()}
          {/* A second copy so the loop has somewhere to go; hidden, so nothing is announced twice. */}
          {moving && list(true)}
        </div>
      </div>
      {moving && (
        <button
          type="button"
          onClick={() => setHeld((was) => !was)}
          aria-pressed={held}
          className="absolute right-3 top-1/2 z-20 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-rule bg-paper text-ink-3 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <span className="sr-only">{held ? 'Let the row move again' : 'Stop the row'}</span>
          <span aria-hidden className="flex gap-[2px]">
            <span className="block h-2.5 w-[2px] bg-current" />
            <span className="block h-2.5 w-[2px] bg-current" />
          </span>
        </button>
      )}
    </section>
  );
}
