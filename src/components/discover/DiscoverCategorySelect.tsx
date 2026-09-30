'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { CATEGORIES, type Category } from '@/lib/agents/categories';

export function DiscoverCategorySelect({ intent, selectedCategory, evidence }: { intent: string; selectedCategory: Category | null; evidence: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const choose = (value: string) => {
    const params = new URLSearchParams({ intent });
    if (value) params.set('category', value);
    if (evidence) params.set('evidence', evidence);
    startTransition(() => router.push(`/discover?${params.toString()}#results`));
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="outcome-filter" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-faint)]">
        Category
      </label>
      <div className="relative">
        <select
          id="outcome-filter"
          value={selectedCategory ?? ''}
          onChange={(event) => choose(event.target.value)}
          disabled={isPending}
          className="w-full appearance-none rounded-xl border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-3 py-3 pr-9 text-xs font-medium text-[color:var(--text)] outline-none transition-colors hover:bg-[color:var(--surface-hover)] focus:border-[color:var(--brand)] disabled:cursor-wait disabled:opacity-60"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
        </select>
        <svg viewBox="0 0 20 20" aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 fill-none stroke-[color:var(--text-muted)]" strokeWidth="1.7"><path d="m6 8 4 4 4-4" /></svg>
      </div>
    </div>
  );
}
