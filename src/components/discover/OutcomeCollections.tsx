import Link from 'next/link';
import type { ReactNode } from 'react';

import { CATEGORIES, type Category } from '@/lib/agents/categories';

const OUTCOME_STYLES: Record<Category, { icon: ReactNode; surface: string; iconStyle: string; linkStyle: string }> = {
  rebalancing: {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h11" /><path d="m12 4 3 3-3 3" /><path d="M20 17H9" /><path d="m12 14-3 3 3 3" />
      </svg>
    ),
    surface: 'border-sky-500/20 bg-sky-500/[0.045] hover:border-sky-500/35',
    iconStyle: 'bg-sky-500/12 text-sky-600 ring-sky-500/15 dark:text-sky-300',
    linkStyle: 'text-sky-700 dark:text-sky-300',
  },
  'grid-trading': {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M6 3v18M12 3v18M18 3v18M3 7h18M3 17h18" /><path d="m3 13 4-3 5 3 9-5" />
      </svg>
    ),
    surface: 'border-violet-500/20 bg-violet-500/[0.045] hover:border-violet-500/35',
    iconStyle: 'bg-violet-500/12 text-violet-600 ring-violet-500/15 dark:text-violet-300',
    linkStyle: 'text-violet-700 dark:text-violet-300',
  },
  yield: {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18 10 12l4 3 6-8" /><path d="M15 7h5v5" /><path d="M4 21h16" />
      </svg>
    ),
    surface: 'border-emerald-500/20 bg-emerald-500/[0.045] hover:border-emerald-500/35',
    iconStyle: 'bg-emerald-500/12 text-emerald-600 ring-emerald-500/15 dark:text-emerald-300',
    linkStyle: 'text-emerald-700 dark:text-emerald-300',
  },
  'health-factor': {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 4.5 6v5.5c0 4.4 3 7.8 7.5 9.5 4.5-1.7 7.5-5.1 7.5-9.5V6L12 3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" />
      </svg>
    ),
    surface: 'border-amber-500/20 bg-amber-500/[0.05] hover:border-amber-500/35',
    iconStyle: 'bg-amber-500/14 text-amber-700 ring-amber-500/15 dark:text-amber-300',
    linkStyle: 'text-amber-800 dark:text-amber-300',
  },
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
          const style = OUTCOME_STYLES[category.id];
          return (
            <Link
              key={category.id}
              href={`/discover?category=${category.id}#explore`}
              className={`group relative flex min-h-32 items-start gap-4 overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)] ${active ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/8 ring-1 ring-[color:var(--brand)]/15' : style.surface}`}
            >
              <span aria-hidden="true" className={`absolute inset-x-6 top-0 h-px opacity-80 ${active ? 'bg-[color:var(--brand)]' : 'bg-current ' + style.linkStyle}`} />
              <span className={`grid size-11 shrink-0 place-items-center rounded-xl ring-1 ${active ? 'bg-[color:var(--brand)] text-[color:var(--brand-ink)] ring-[color:var(--brand)]/20' : style.iconStyle}`}>{style.icon}</span>
              <span className="relative flex min-w-0 flex-1 flex-col">
                <span className="flex items-center justify-between gap-3">
                  <strong className="text-sm">{category.label}</strong>
                  <span className="rounded-full border border-black/[0.04] bg-[color:var(--surface)]/75 px-2 py-1 text-[10px] tabular-nums text-[color:var(--text-faint)] shadow-sm dark:border-white/[0.06]">{counts[category.id]} agents</span>
                </span>
                <span className="mt-2 text-xs leading-relaxed text-[color:var(--text-muted)]">{category.blurb}</span>
                <span className={`mt-3 text-[11px] font-semibold ${active ? 'text-[color:var(--brand-strong)]' : style.linkStyle}`}>Explore evidence <span aria-hidden="true" className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span></span>
              </span>
            </Link>
          );
        })}
      </div>
      {selected && <Link href="/discover#explore" className="w-fit text-xs font-medium text-[color:var(--info)] underline decoration-dotted underline-offset-2">Clear outcome filter</Link>}
    </section>
  );
}
