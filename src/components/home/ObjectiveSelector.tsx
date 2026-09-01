import Link from 'next/link';

import type { Category } from '@/lib/agents/categories';

/**
 * §15. The entry point to the product loop.
 *
 * Framed by what the user is trying to do rather than by strategy taxonomy —
 * someone with $5,000 knows they want to earn, not that they want a
 * "concentrated liquidity range manager".
 */
export const OBJECTIVES: {
  id: string;
  label: string;
  blurb: string;
  category: Category;
}[] = [
  {
    id: 'earn',
    label: 'Earn',
    blurb: 'Put idle capital to work at the best risk-adjusted yield.',
    category: 'yield',
  },
  {
    id: 'trade',
    label: 'Trade',
    blurb: 'Run a systematic strategy inside a price range.',
    category: 'grid-trading',
  },
  {
    id: 'protect',
    label: 'Protect',
    blurb: 'Watch a loan position and act before liquidation.',
    category: 'health-factor',
  },
  {
    id: 'rebalance',
    label: 'Rebalance',
    blurb: 'Keep allocations and LP ranges where you intended them.',
    category: 'rebalancing',
  },
];

export function ObjectiveSelector() {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-sm font-medium text-[color:var(--text-secondary)]">
        What are you trying to do?
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {OBJECTIVES.map((objective, index) => (
          <Link
            key={objective.id}
            href={`/discover?objective=${objective.id}`}
            style={{ animationDelay: `${index * 40}ms` }}
            className="rise-in group flex h-full flex-col gap-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5 hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)]"
          >
            <span className="text-base font-medium">{objective.label}</span>
            <span className="text-xs leading-relaxed text-[color:var(--text-muted)]">
              {objective.blurb}
            </span>
            <span className="mt-auto pt-2 text-[11px] text-[color:var(--text-faint)] transition-colors group-hover:text-[color:var(--info)]">
              Find agents →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
