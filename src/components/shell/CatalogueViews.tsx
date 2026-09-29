import Link from 'next/link';

import { cn } from '@/lib/ui/cn';

const VIEWS = [
  { href: '/agents', label: 'Catalogue', hint: 'Every indexed agent, filterable' },
  { href: '/leaderboard', label: 'Rankings', hint: 'Ordered by evidence score' },
] as const;

/**
 * The catalogue and the ranking, as two views of one set.
 *
 * They were separate top-level destinations, which asked a visitor to decide
 * between "Marketplace" and "Rankings" before knowing that both show the same
 * eighty agents in a different order. Showing the pair on both pages makes the
 * relationship visible and is what lets the nav carry one entry for browsing
 * rather than four.
 */
export function CatalogueViews({ active }: { active: '/agents' | '/leaderboard' }) {
  return (
    <nav
      aria-label="Catalogue views"
      className="flex w-fit gap-1 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-1"
    >
      {VIEWS.map((view) => {
        const current = view.href === active;
        return (
          <Link
            key={view.href}
            href={view.href}
            aria-current={current ? 'page' : undefined}
            title={view.hint}
            className={cn(
              'rounded-[calc(var(--radius)-2px)] px-3.5 py-1.5 text-[12px] font-medium transition-colors',
              current
                ? 'bg-[color:var(--surface)] text-[color:var(--text)] shadow-sm'
                : 'text-[color:var(--text-muted)] hover:text-[color:var(--text)]',
            )}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
