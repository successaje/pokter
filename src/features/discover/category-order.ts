import { CATEGORIES, type Category } from '@/lib/agents/categories';
import { FLAGSHIP_CATEGORY_ORDER } from '@/lib/agents/flagship-playbooks';

/**
 * The order the task filters read in, on Discover and the full listing.
 *
 * The four kinds of work Pokter publishes a buying guide for come first,
 * in the guides' own order, then the rest as the catalogue declares them,
 * with the catch-all last.
 *
 * It used to read broad work first and the DeFi specialties after. That is
 * a reasonable rule and the wrong one for this catalogue: the broad three
 * are its smallest shelves, and the four behind them hold the most agents,
 * carry the guides, and are the four named in the "Plan a better hire" nav
 * directly above the row. The page was recommending four kinds of work in
 * one line and burying them in the next, with the largest shelf of all
 * wrapped onto a second row.
 *
 * Derived rather than written out, so this row and that nav cannot drift:
 * there is one list of flagship categories and this reads it. Keeping it
 * out of the component also keeps it testable without rendering anything.
 */
export const CATEGORY_ORDER: ReadonlyArray<Category | 'unclassified'> = [
  ...FLAGSHIP_CATEGORY_ORDER,
  ...CATEGORIES.map((c) => c.id).filter((id) => !FLAGSHIP_CATEGORY_ORDER.includes(id as never)),
  'unclassified',
];

const RANK = new Map<Category | 'unclassified', number>(CATEGORY_ORDER.map((id, i) => [id, i]));

/**
 * Where a category sits in the row.
 *
 * A category the list has never heard of sorts last rather than first,
 * which is what an unranked id would otherwise do with a numeric sort.
 */
export function categoryRank(id: Category | 'unclassified'): number {
  return RANK.get(id) ?? CATEGORY_ORDER.length;
}
