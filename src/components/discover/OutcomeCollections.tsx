import Link from 'next/link';

import { CATEGORIES, type Category } from '@/lib/agents/categories';

const ICONS: Record<Category, string> = {
  rebalancing: '◫',
  'grid-trading': '⌗',
  yield: '↗',
  'health-factor': '⌁',
};

export function OutcomeCollections({ counts, selected }: { counts: Record<Category, number>; selected: string | null }) {
  return (
    <section aria-labelledby="outcome-collections-title" className="flex flex-col gap-5">
      <div>
        <h2 id="outcome-collections-title" className="text-xl font-semibold tracking-tight sm:text-2xl">Browse by financial outcome</h2>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">Start with the responsibility you want an agent to take on.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {CATEGORIES.map((category) => {
          const active = selected === category.id;
          return (
            <Link
              key={category.id}
              href={`/discover?category=${category.id}#explore`}
              className={`group flex min-h-32 items-start gap-4 rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)] ${active ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/8' : 'border-[color:var(--border)] bg-[color:var(--surface)] hover:border-[color:var(--border-strong)]'}`}
            >
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-base ${active ? 'bg-[color:var(--brand)] text-[color:var(--brand-ink)]' : 'bg-[color:var(--bg-subtle)] text-[color:var(--text-muted)]'}`}>{ICONS[category.id]}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center justify-between gap-3">
                  <strong className="text-sm">{category.label}</strong>
                  <span className="rounded-full bg-[color:var(--bg-subtle)] px-2 py-1 text-[10px] tabular-nums text-[color:var(--text-faint)]">{counts[category.id]} agents</span>
                </span>
                <span className="mt-2 text-xs leading-relaxed text-[color:var(--text-muted)]">{category.blurb}</span>
                <span className="mt-3 text-[11px] font-medium text-[color:var(--info)]">Explore evidence →</span>
              </span>
            </Link>
          );
        })}
      </div>
      {selected && <Link href="/discover#explore" className="w-fit text-xs font-medium text-[color:var(--info)] underline decoration-dotted underline-offset-2">Clear outcome filter</Link>}
    </section>
  );
}
