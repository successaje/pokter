import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { deriveMaturity } from '@/lib/agents/maturity';
import type { FindRow } from '@/lib/find/rows';

/**
 * A draft as the catalogue row Discover will show for it on its first day.
 *
 * The preview renders Pokter's real card from this, so it cannot drift from
 * what buyers browse. Its evidence is the honest starting point: registered,
 * and nothing else earned. An endpoint that passed the check on this page
 * has not yet answered Pokter's scheduled checks, which are what the
 * listing's "Answers" step counts, so the card does not claim it.
 */
export function draftPreviewRow(draft: { name: string; description: string; category: string; image: string }, chainId: 56 | 97): FindRow {
  const category = (CATEGORY_BY_ID.has(draft.category as Category) ? draft.category : 'unclassified') as Category | 'unclassified';
  return {
    key: 'draft',
    /* The network chosen at Publish: the card names where it is registered, and that must not say testnet for a mainnet agent. */
    chainId,
    tokenId: 'new',
    name: draft.name.trim() || 'Your agent',
    imageUrl: /^https:\/\//i.test(draft.image) ? draft.image : null,
    category,
    categoryLabel: category === 'unclassified' ? 'No category' : (CATEGORY_BY_ID.get(category)?.label ?? 'No category'),
    description: draft.description.trim(),
    verdict: 'unproven',
    rate: null,
    probes: 0,
    cells: [],
    medianMs: null,
    sinceAnswer: null,
    answeringToday: false,
    hireChainId: null,
    priceState: 'none',
    priceU: null,
    priceLabel: 'No signed price yet',
    suggested: null,
    priceFresh: false,
    hirable: false,
    deliveredByPokter: false,
    paid: { jobs: 0, completed: 0, delivered: 0, missed: 0, outsideCompleted: 0 },
    maturity: deriveMaturity({
      registered: true,
      reachable: false,
      compatible: false,
      tested: false,
      hired: false,
      delivered: false,
      deliveredByOperator: false,
      outsideTeam: { jobs: 0, completed: 0, terminal: 0, uniqueBuyers: 0, completionRate: null },
      probeRate: null,
      observedDays: 0,
    }),
    owner: '',
  };
}
