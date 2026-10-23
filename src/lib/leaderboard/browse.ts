import { CATEGORY_BY_ID, type Classification } from '@/lib/agents/categories';

import type { BoardAgent } from './network';

/**
 * Narrowing a board without changing what it claims.
 *
 * Search, a category filter and pagination are all the same hazard wearing
 * three hats: each one hides rows, and a board that hides rows silently is
 * read as the whole board. Every decision here is therefore paired with a
 * statement of what was hidden (`browseSummary`), and ranks are assigned
 * before any of it runs (`rankOutcomeRows` in `outcomes.ts`), so page two
 * says 11 to 20 and a filtered board keeps the standing each row actually
 * holds rather than renumbering the survivors from one.
 *
 * Pure, and deliberately not in the page: `import 'server-only'` puts a
 * route out of reach of the test runner, so the decisions live here where
 * they can be exercised and the page is left with the wiring.
 */

/** Rows on one page of the outcomes table. */
export const ROWS_PER_PAGE = 10;

/** `all` is not a `Classification`, so it cannot be confused with one. */
export const ALL_CATEGORIES = 'all';

export interface BrowseQuery {
  /**
   * What the reader typed, trimmed. Kept in the reader's own case so the
   * page can quote it back; matching lower-cases both sides.
   */
  search: string;
  /** One category to show alone, or `all`. */
  category: Classification | typeof ALL_CATEGORIES;
  /** 1-based, already coerced to a whole number ≥ 1. Clamped later against the row count. */
  page: number;
}

export const NO_BROWSE: BrowseQuery = { search: '', category: ALL_CATEGORIES, page: 1 };

function one(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value : '';
}

/**
 * The longest search Pokter will act on.
 *
 * A query is echoed back to the reader ("3 of 9 agents matching …"), so an
 * unbounded one is a long string of someone else's choosing rendered on the
 * page. React escapes it, which is why this is a length cap and not an
 * attempt at sanitising: the risk being managed is a layout the reader
 * cannot use, not an injection.
 */
export const MAX_SEARCH = 64;

export function browseQueryFrom(raw: {
  q?: string | string[] | undefined;
  category?: string | string[] | undefined;
  page?: string | string[] | undefined;
}): BrowseQuery {
  const search = one(raw.q).trim().slice(0, MAX_SEARCH);
  const category = one(raw.category);
  const page = Number.parseInt(one(raw.page), 10);
  return {
    search,
    /*
     * Checked against the real list rather than cast. A query string is
     * whatever a visitor typed, and `category=nonsense` casting to a
     * `Classification` would produce a board filtered to nothing while the
     * chips all read as unselected — an empty table with no explanation.
     */
    category:
      category === 'unclassified' || CATEGORY_BY_ID.has(category as Classification)
        ? (category as Classification)
        : ALL_CATEGORIES,
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
  };
}

/** Whether this query narrows anything at all. */
export function isNarrowed(query: BrowseQuery): boolean {
  return query.search.length > 0 || query.category !== ALL_CATEGORIES;
}

/**
 * Whether an agent matches what was typed.
 *
 * Name only, and a plain case-insensitive substring. Matching the token id
 * or the chain as well was considered and dropped: "56" would then select
 * every mainnet registration, which is a filter the reader did not ask for
 * and cannot see the rule behind.
 */
export function matchesSearch(agent: BoardAgent, search: string): boolean {
  if (search.length === 0) return true;
  return agent.name.toLowerCase().includes(search.toLowerCase());
}

export function matchesCategory(agent: BoardAgent, category: BrowseQuery['category']): boolean {
  return category === ALL_CATEGORIES || agent.category === category;
}

export function matchesBrowse(agent: BoardAgent, query: BrowseQuery): boolean {
  return matchesSearch(agent, query.search) && matchesCategory(agent, query.category);
}

/** How many rows each category holds, for chips that show the distribution. */
export function categoryCounts(agents: ReadonlyArray<BoardAgent>): Map<Classification, number> {
  const counts = new Map<Classification, number>();
  for (const agent of agents) counts.set(agent.category, (counts.get(agent.category) ?? 0) + 1);
  return counts;
}

export interface Page<T> {
  /** The rows to render, already filtered and sliced. */
  rows: readonly T[];
  /** Rows the board holds before any narrowing. */
  total: number;
  /** Rows that survived the search and the category filter. */
  matched: number;
  /** The page actually being shown, after clamping. */
  page: number;
  /** How many pages the matched rows make. At least 1, even with nothing matched. */
  pages: number;
  /** 1-based position of the first and last row shown, or null when nothing is. */
  from: number | null;
  to: number | null;
}

/**
 * One page of rows, with everything needed to say what is not on it.
 *
 * The clamp matters more than it looks. `?page=9` on a board that has
 * shrunk to one page would otherwise render an empty table under a heading
 * that says nine agents are listed — a page that looks like a board with no
 * agents on it. Clamping to the last page shows real rows and the summary
 * says which ones.
 */
export function pageOf<T>(
  rows: readonly T[],
  matches: (row: T) => boolean,
  query: BrowseQuery,
  perPage: number = ROWS_PER_PAGE,
): Page<T> {
  const kept = rows.filter(matches);
  const size = Math.max(1, Math.floor(perPage));
  const pages = Math.max(1, Math.ceil(kept.length / size));
  const page = Math.min(Math.max(1, query.page), pages);
  const start = (page - 1) * size;
  const shown = kept.slice(start, start + size);
  return {
    rows: shown,
    total: rows.length,
    matched: kept.length,
    page,
    pages,
    from: shown.length === 0 ? null : start + 1,
    to: shown.length === 0 ? null : start + shown.length,
  };
}

function categoryLabel(category: Classification): string {
  return CATEGORY_BY_ID.get(category)?.label ?? 'Not categorised';
}

/**
 * What the reader is looking at, in one sentence, whenever it is not
 * everything.
 *
 * Built from the page rather than written beside it, because the defect
 * this prevents is a count that stops agreeing with the rows under it. A
 * board that says "9 agents" while showing 3 is the same class of fault as
 * a column header that outlives its rule: the figure is right somewhere and
 * wrong where it is printed.
 *
 * Returns null when nothing is hidden — a board showing all of itself needs
 * no caption, and one that appears anyway teaches the reader to ignore it.
 */
export function browseSummary<T>(page: Page<T>, query: BrowseQuery, noun = 'agents'): string | null {
  const narrowed = isNarrowed(query);
  if (!narrowed && page.pages === 1) return null;
  const filters: string[] = [];
  if (query.search.length > 0) filters.push(`matching “${query.search}”`);
  if (query.category !== ALL_CATEGORIES) filters.push(`in ${categoryLabel(query.category)}`);
  const where = filters.length > 0 ? ` ${filters.join(', ')}` : '';
  if (page.matched === 0) return `No ${noun} on this board${where}.`;
  if (page.from === null || page.to === null) return `${page.matched} of ${page.total} ${noun}${where}.`;
  /*
   * The board's own total is named whenever it is not what is on screen, and
   * only then. "Showing 1–2 of 9" on a board of 9 is a caption that teaches
   * readers to skip captions; "of 2 matching, from 9 on this board" is the
   * one that stops a filtered table being read as the whole board.
   */
  if (!narrowed) return `Showing ${page.from}–${page.to} of ${page.total} ${noun}.`;
  return `Showing ${page.from}–${page.to} of ${page.matched} ${noun}${where}, from ${page.total} on this board.`;
}

/**
 * The page numbers to draw, with gaps marked.
 *
 * `null` is an elision, never a page. A run of twenty numbered links is not
 * a control a reader uses; it is a wall they scroll past.
 */
export function pageLinks(current: number, pages: number): ReadonlyArray<number | null> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const around = new Set([1, pages, current, current - 1, current + 1]);
  const wanted = [...around].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  let previous = 0;
  for (const n of wanted) {
    if (previous && n - previous > 1) out.push(null);
    out.push(n);
    previous = n;
  }
  return out;
}
