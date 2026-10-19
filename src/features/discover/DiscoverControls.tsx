'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';

import { MARKETPLACE_ORDERS, type MarketplaceOrder } from '@/lib/search/order';
import { cn } from '@/lib/ui/cn';
import { Spinner } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { discoverHref, type DiscoverParams } from './params';

/** The query box on Discover: keeps the filters, replaces the words. */
export function DiscoverSearch({ params }: { params: DiscoverParams }) {
  const router = useRouter();
  const [value, setValue] = useState(params.q);
  const [pending, start] = useTransition();
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        start(() => router.push(discoverHref({ q: value.trim() }, params)));
      }}
      className="flex flex-col gap-2.5 sm:flex-row"
    >
      <div className="flex min-h-14 flex-1 items-center gap-3 rounded-[12px] border border-rule-strong bg-raised px-4 transition-[border-color,box-shadow] focus-within:border-ink focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--signal)_24%,transparent)] sm:min-h-16 sm:rounded-[16px]">
        {pending ? <Spinner size={18} className="text-ink-3" /> : <Icon.Search size={18} className="shrink-0 text-ink-3" />}
        <label htmlFor="discover-q" className="sr-only">
          What outcome do you need?
        </label>
        <input
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
        className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[11px] bg-ink px-6 text-[13.5px] font-semibold text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:h-16 sm:rounded-[16px]"
      >
        Find an agent
        <Icon.Arrow size={14} />
      </button>
    </form>
  );
}

export function SortSelect({ params, className }: { params: DiscoverParams; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className={cn('flex items-center gap-2 text-[13px] text-ink-3', className)}>
      {pending ? <Spinner size={13} /> : 'Sort'}
      <select
        value={params.sort}
        onChange={(e) => start(() => router.push(discoverHref({ sort: e.target.value as MarketplaceOrder }, params), { scroll: false }))}
        className="h-8 rounded-[7px] border border-rule-strong bg-raised px-2 text-[13px] text-ink focus:border-ink focus:outline-none"
      >
        {MARKETPLACE_ORDERS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** On phones the filter column becomes a sheet behind one button. */
export function MobileFilters({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('inline-flex h-9 items-center gap-2 rounded-[8px] border border-rule-strong bg-raised px-3 text-[13px] font-medium lg:hidden')}
      >
        <Icon.Filter size={15} /> Filters
        {count > 0 && <span className="t-readout grid size-5 place-items-center rounded-full bg-ink text-[11px] text-paper">{count}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filters">
        <div onClick={(e) => (e.target as HTMLElement).closest('a') && setOpen(false)}>{children}</div>
      </Sheet>
    </>
  );
}
