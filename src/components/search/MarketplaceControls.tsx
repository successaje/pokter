'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { MARKETPLACE_ORDERS, type MarketplaceOrder } from '@/lib/search/order';
import { parseQuery, stringifyQuery } from '@/lib/search/query';

export function MarketplaceControls({ order }: { order: MarketplaceOrder }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const parsed = parseQuery(params.get('q') ?? '');
  const responsive = parsed.qualifiers.some((item) => item.kind === 'is' && item.value === 'responsive');

  function navigate(next: URLSearchParams) {
    startTransition(() => router.push(`/agents${next.size ? `?${next.toString()}` : ''}`, { scroll: false }));
  }

  function setOrder(value: MarketplaceOrder) {
    const next = new URLSearchParams(params.toString());
    if (value === 'recommended') next.delete('sort');
    else next.set('sort', value);
    navigate(next);
  }

  function setResponsive(checked: boolean) {
    const next = new URLSearchParams(params.toString());
    const remaining = parsed.qualifiers.filter((item) => !(item.kind === 'is' && item.value === 'responsive'));
    if (checked) remaining.push({ kind: 'is', value: 'responsive' });
    const query = stringifyQuery(remaining);
    if (query) next.set('q', query);
    else next.delete('q');
    navigate(next);
  }

  return (
    <div className="flex flex-col justify-between gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3 sm:flex-row sm:items-center">
      <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[var(--radius)] px-2 text-[11px] font-medium">
        <input type="checkbox" checked={responsive} disabled={pending} onChange={(event) => setResponsive(event.target.checked)} className="size-4 accent-[color:var(--brand)]" />
        Hide agents not answering recently
      </label>
      <label className="flex items-center gap-2 text-[10px] text-[color:var(--text-muted)]">
        Sort
        <select value={order} disabled={pending} onChange={(event) => setOrder(event.target.value as MarketplaceOrder)} className="h-10 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-[11px] font-medium text-[color:var(--text)] outline-none focus:border-[color:var(--border-focus)]">
          {MARKETPLACE_ORDERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>
  );
}

