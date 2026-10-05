import Link from 'next/link';
import type { ReactNode } from 'react';

import { CATEGORIES, type Category } from '@/lib/agents/categories';

/*
 * Icons only. These four entries used to carry a hue each — sky, violet,
 * emerald, amber — with hand-written dark-mode variants, and that collided
 * with the one thing colour means in this product.
 *
 * Green is Proven, amber is Intermittent, red is Failing. Painting the yield
 * category emerald and the liquidation-risk category amber put verdict
 * colours on cards that carry no verdict, on pages that show real evidence
 * badges a few hundred pixels away: the yield card read as endorsed and the
 * liquidation card as a warning, when both are just names for a kind of job.
 *
 * The categories still need telling apart, so they keep their icons. Shape
 * distinguishes without claiming anything, and the active state keeps using
 * the brand, which is the one colour here that does mean "you chose this".
 */
const OUTCOME_ICONS: Record<Category, ReactNode> = {
  'token-safety': (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6Z" /><path d="m9 12 2 2 4-4" />
      </svg>
    ),
  rebalancing: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h11" /><path d="m12 4 3 3-3 3" /><path d="M20 17H9" /><path d="m12 14-3 3 3 3" />
      </svg>
    ),
  'grid-trading': (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M6 3v18M12 3v18M18 3v18M3 7h18M3 17h18" /><path d="m3 13 4-3 5 3 9-5" />
      </svg>
    ),
  yield: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18 10 12l4 3 6-8" /><path d="M15 7h5v5" /><path d="M4 21h16" />
      </svg>
    ),
  'health-factor': (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 4.5 6v5.5c0 4.4 3 7.8 7.5 9.5 4.5-1.7 7.5-5.1 7.5-9.5V6L12 3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" />
      </svg>
    ),
};

/**
 * `shown` is what this page will list; `indexed` is everything the registry
 * holds in that category. They differ when an operator's own text marks an
 * agent as a test deployment, which this page hides and the catalogue does
 * not — so the card states both rather than picking one and calling it
 * "agents", which is how the same category came to read 17 here and 18 a
 * click away.
 */
function countLabel({ shown, indexed }: { shown: number; indexed: number }) {
  return shown === indexed
    ? `${shown} ${shown === 1 ? 'agent' : 'agents'}`
    : `${shown} of ${indexed} indexed`;
}

export function OutcomeCollections({ counts, selected }: { counts: Record<Category, { shown: number; indexed: number }>; selected: string | null }) {
  return (
    <section aria-labelledby="outcome-collections-title" className="flex flex-col gap-5">
      <div>
        <h2 id="outcome-collections-title" className="text-xl font-semibold tracking-tight sm:text-2xl">Browse by financial outcome</h2>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">Start with the responsibility you want an agent to take on.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {CATEGORIES.map((category) => {
          const active = selected === category.id;
          const icon = OUTCOME_ICONS[category.id];
          return (
            <Link
              key={category.id}
              href={`/discover?category=${category.id}#explore`}
              className={`group relative flex min-h-32 items-start gap-4 overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)] ${active ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/8 ring-1 ring-[color:var(--brand)]/15' : 'border-[color:var(--border)] bg-[color:var(--surface)] hover:border-[color:var(--border-strong)]'}`}
            >
              <span aria-hidden="true" className={`absolute inset-x-6 top-0 h-px ${active ? 'bg-[color:var(--brand)] opacity-80' : 'bg-[color:var(--border-strong)]'}`} />
              <span className={`grid size-11 shrink-0 place-items-center rounded-xl ring-1 ${active ? 'bg-[color:var(--brand)] text-[color:var(--brand-ink)] ring-[color:var(--brand)]/20' : 'bg-[color:var(--bg-subtle)] text-[color:var(--text-secondary)] ring-[color:var(--border)]'}`}>{icon}</span>
              <span className="relative flex min-w-0 flex-1 flex-col">
                <span className="flex items-center justify-between gap-3">
                  <strong className="text-sm">{category.label}</strong>
                  {/*
                    --text-muted, not --text-faint: on the subtle surface this
                    pill sits on, faint measures 4.49:1 at 11.5px, which misses
                    AA by a hair. The count is the one number on the card, so
                    it is the wrong thing to make the least legible.
                  */}
                  <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-2 py-1 text-[10px] tabular-nums text-[color:var(--text-muted)]">{countLabel(counts[category.id])}</span>
                </span>
                <span className="mt-2 text-xs leading-relaxed text-[color:var(--text-muted)]">{category.blurb}</span>
                {/*
                  Neutral, not --info. The whole card is the link, so this is
                  an affordance cue rather than a separate target — and --info
                  at 12.5px semibold measures 4.24:1 on the dark card surface,
                  under the 4.5:1 AA needs at this size. The per-category
                  colours this replaced were lighter and happened to clear it.
                */}
                <span className={`mt-3 text-[11px] font-semibold ${active ? 'text-[color:var(--brand-strong)]' : 'text-[color:var(--text-secondary)]'}`}>Explore evidence <span aria-hidden="true" className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span></span>
              </span>
            </Link>
          );
        })}
      </div>
      {selected && <Link href="/discover#explore" className="w-fit text-xs font-medium text-[color:var(--info)] underline decoration-dotted underline-offset-2">Clear outcome filter</Link>}
    </section>
  );
}
