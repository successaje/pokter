import type { Category } from '@/lib/agents/categories';

/**
 * The four objectives, as a plain list.
 *
 * These used to live inside the landing page's outcome scenes, and outlived
 * them: the scenes were cut but Discover and the brief form still build their
 * objective pickers from this list, and were importing it from a component
 * nothing rendered any more. A constant two pages depend on should not be
 * reachable only through a deleted screen.
 */
export const OBJECTIVES: {
  id: string;
  label: string;
  eyebrow: string;
  blurb: string;
  category: Category;
}[] = [
  {
    id: 'earn',
    label: 'Put idle capital to work.',
    eyebrow: 'Earn',
    blurb:
      'Explore agents that compare vaults, lending markets and yield routes, then inspect the evidence behind every recommendation.',
    category: 'yield',
  },
  {
    id: 'trade',
    label: 'Trade with a system, not an impulse.',
    eyebrow: 'Trade',
    blurb:
      'Find agents that plan repeatable price-range strategies and publish enough detail for you to review before committing capital.',
    category: 'grid-trading',
  },
  {
    id: 'protect',
    label: 'See risk before it becomes a liquidation.',
    eyebrow: 'Protect',
    blurb:
      'Compare monitors that watch lending positions, calculate health factors and surface the conditions that require your attention.',
    category: 'health-factor',
  },
  {
    id: 'rebalance',
    label: 'Keep capital where you intended.',
    eyebrow: 'Rebalance',
    blurb:
      'Review agents built to maintain portfolio weights and liquidity ranges, with availability and attestations shown beside the claim.',
    category: 'rebalancing',
  },
];
