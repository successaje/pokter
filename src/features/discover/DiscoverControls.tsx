'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';

import { MARKETPLACE_ORDERS, type MarketplaceOrder } from '@/lib/search/order';
import { cn } from '@/lib/ui/cn';
import { Spinner } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { discoverHref, requestHrefFor, type DiscoverParams } from './params';

/** The query box on Discover: keeps the filters, replaces the words. */
export function DiscoverSearch({ params }: { params: DiscoverParams }) {
  const router = useRouter();
  const [value, setValue] = useState(params.q);
  const [pending, start] = useTransition();
  /* The header's search button lands here (`#discover-q`): ready to type, not just scrolled to. */
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focus = () => {
      if (window.location.hash === '#discover-q') input.current?.focus();
    };
    // Arriving from another page, the hash is set after this first runs; the next frame sees it.
    focus();
    const frame = requestAnimationFrame(focus);
    window.addEventListener('hashchange', focus);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', focus);
    };
  }, []);
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        start(() => router.push(discoverHref({ q: value.trim() }, params)));
      }}
      /* One row from `sm`; on a phone the box takes the width and the two actions share the line under it. */
      className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-row"
    >
      <div className="col-span-2 flex min-h-13 flex-1 items-center gap-3 rounded-[12px] border border-rule-strong bg-raised px-4 transition-[border-color,box-shadow] focus-within:border-ink focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--signal)_24%,transparent)] sm:min-h-14 sm:rounded-[14px]">
        {pending ? <Spinner size={18} className="text-ink-3" /> : <Icon.Search size={18} className="shrink-0 text-ink-3" />}
        <label htmlFor="discover-q" className="sr-only">
          What outcome do you need?
        </label>
        <input
          ref={input}
          id="discover-q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Watch my Venus loan for liquidation risk"
          maxLength={400}
          autoComplete="off"
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-ink-3 focus:outline-none sm:text-[16px]"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              setValue('');
              start(() => router.push(discoverHref({ q: '' }, params)));
            }}
            className="grid size-8 shrink-0 place-items-center rounded-[7px] text-ink-3 hover:bg-sunken hover:text-ink"
            aria-label="Clear search"
          >
            <Icon.Close size={16} />
          </button>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[11px] bg-ink px-6 text-[13.5px] font-semibold text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:h-14 sm:rounded-[14px]"
      >
        Find an agent
        <Icon.Arrow size={14} />
      </button>
      {/*
        The other way to get a job done, beside the first. Requests had no
        way in from where people start looking; whatever is typed here goes
        with it, as the request's title.
      */}
      <Link
        href={requestHrefFor(value)}
        className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[11px] border border-rule-strong px-6 text-[13.5px] font-semibold text-ink transition-colors hover:border-ink sm:h-14 sm:rounded-[14px]"
      >
        <Icon.Plus size={15} aria-hidden />
        Post a request
      </Link>
    </form>
  );
}

export function SortSelect({ params, className, variant = 'boxed' }: { params: DiscoverParams; className?: string; variant?: 'boxed' | 'inline' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inline = variant === 'inline';
  return (
    <label className={cn('flex items-center gap-2 text-[13px] text-ink-3', inline && 't-readout shrink-0', className)}>
      {pending ? <Spinner size={13} /> : inline ? 'sort:' : 'Sort'}
      <select
        value={params.sort}
        onChange={(e) => start(() => router.push(discoverHref({ sort: e.target.value as MarketplaceOrder }, params), { scroll: false }))}
        className={
          inline
            ? 't-readout h-8 cursor-pointer appearance-none bg-transparent pr-4 text-[13px] text-ink [field-sizing:content] focus:outline-none'
            : 'h-8 rounded-[7px] border border-rule-strong bg-raised px-2 text-[13px] text-ink focus:border-ink focus:outline-none'
        }
      >
        {MARKETPLACE_ORDERS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {/* Drawn, because the native arrow goes with `appearance-none`, which lets the box shrink to the chosen option. */}
      {inline && <Icon.ChevronDown size={13} className="pointer-events-none -ml-4 text-ink-2" />}
    </label>
  );
}

/**
 * Everything that narrows the results, with what each filter means: a
 * bottom sheet on a phone, a drawer from the side on wider screens.
 *
 * A quiet text button, not a pill: in a row of pills it read as one more
 * task to choose. No count on it: every filter that is on already shows on
 * the row, as a checked pill or a chip.
 */
export function FiltersButton({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-sunken hover:text-ink max-sm:-ml-2.5"
      >
        <Icon.Filter size={13} /> All filters
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="All filters" variant="drawer">
        <div onClick={(e) => (e.target as HTMLElement).closest('a') && setOpen(false)}>{children}</div>
      </Sheet>
    </>
  );
}

/**
 * A row of filter pills. From `sm` it wraps; on a phone it is one line that
 * scrolls sideways, edge to edge, and opens at the pill that is on, so a
 * chosen task is never the one past the edge.
 */
export function PillRow({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const shown = useRef<Element | null>(null);
  useEffect(() => {
    const el = row.current;
    const on = el?.querySelector<HTMLElement>('[aria-current="true"], [aria-checked="true"]');
    if (!el || !on || on === shown.current) return;
    shown.current = on;
    const inView = on.offsetLeft >= el.scrollLeft && on.offsetLeft + on.offsetWidth <= el.scrollLeft + el.clientWidth;
    // Sideways only: scrollIntoView would also move the page to the row.
    if (!inView) el.scrollLeft = on.offsetLeft - 16;
  });
  return (
    <div
      ref={row}
      role="group"
      aria-label={label}
      className={cn(
        'relative flex gap-2 sm:flex-wrap',
        // Room above and below for the focus ring, which the scroller would otherwise clip.
        'max-sm:-mx-4 max-sm:-my-1 max-sm:overflow-x-auto max-sm:px-4 max-sm:py-1 max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}
