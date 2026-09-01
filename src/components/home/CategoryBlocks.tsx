import Link from 'next/link';

import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import type { Listing } from '@/lib/marketplace';

const CATEGORY_ROUTES: Record<Category, string> = {
  rebalancing: '/categories/rebalancing',
  'grid-trading': '/categories/grid-trading',
  yield: '/categories/yield',
  'health-factor': '/categories/health-factor',
};

/**
 * §70. The four categories, rendered identically.
 *
 * Same component, same layout, same metrics for every category — there is no
 * "hero" category and no afterthought. If one block looks emptier than another
 * that is a fact about the registry, not about how much attention we gave it.
 */
export function CategoryBlocks({
  sections,
}: {
  sections: { category: Category; listings: Listing[] }[];
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-[color:var(--text-secondary)]">
          Four financial categories
        </h2>
        <Link
          href="/agents"
          className="text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
        >
          Browse all agents →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map(({ category, listings }) => {
          const meta = CATEGORY_BY_ID.get(category);
          if (!meta) return null;

          const withEvidence = listings.filter((l) => l.attestationCount > 0);
          const leader = listings[0];

          return (
            <Link
              key={category}
              href={CATEGORY_ROUTES[category]}
              className="group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 transition-colors hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)]"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{meta.label}</span>
                <span className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                  {meta.blurb}
                </span>
              </div>

              <dl className="flex flex-col gap-1.5 border-t border-[color:var(--border)] pt-3 text-[11px]">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-[color:var(--text-faint)]">Indexed</dt>
                  <dd className="tabular">{listings.length}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-[color:var(--text-faint)]">With evidence</dt>
                  <dd className="tabular">{withEvidence.length}</dd>
                </div>
              </dl>

              <div className="mt-auto border-t border-[color:var(--border)] pt-3">
                <p className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                  Leading
                </p>
                <p className="mt-1 truncate text-[11px] text-[color:var(--text-secondary)] group-hover:text-[color:var(--text)]">
                  {leader ? leader.agent.name : 'No agent indexed yet'}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
