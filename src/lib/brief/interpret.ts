import { CATEGORIES, type Category } from '@/lib/agents/categories';

export interface BriefReading {
  /** The category Pokter believes the brief is asking for, if it can tell. */
  category: Category | null;
  /** What the reading was based on, shown to the reader rather than hidden. */
  because: string;
  /** Terms Pokter recognised. Empty when it recognised nothing. */
  matched: string[];
  /**
   * Which component produced this reading. Displayed, because a keyword match
   * and a language model are different claims and the page should not let them
   * look the same.
   */
  by: 'keywords' | 'model';
}

/*
 * The vocabulary each category answers to.
 *
 * Deliberately the words a person would use rather than the protocol's own —
 * somebody describing a job says "stop me getting liquidated", not "health
 * factor monitoring". Both are here; the human phrasing is the one that has to
 * work.
 */
const SIGNALS: Record<Category, string[]> = {
  'token-safety': [
    'honeypot', 'rug', 'scam', 'safe to buy', 'can i sell', 'sell tax',
    'buy tax', 'token safety', 'contract', 'is this token', 'screen',
    'mint', 'blacklist', 'liquidity lock',
  ],
  'health-factor': [
    'liquidat', 'health factor', 'collateral', 'loan', 'borrow', 'venus',
    'aave', 'lending', 'margin call', 'safe', 'protect', 'risk of losing',
    'underwater', 'repay',
  ],
  yield: [
    'yield', 'apy', 'apr', 'interest', 'earn', 'idle', 'passive', 'vault',
    'stake', 'staking', 'farm', 'best return', 'put my money to work',
    'compound', 'beefy',
  ],
  'grid-trading': [
    'grid', 'trade', 'trading', 'buy low', 'sell high', 'range', 'ladder',
    'dca', 'swing', 'price range', 'bot', 'strategy', 'entries',
  ],
  rebalancing: [
    'rebalance', 'rebalancing', 'allocation', 'weights', 'portfolio',
    'drift', 'lp', 'liquidity position', 'concentrated', 'pancakeswap',
    'target split', 'out of balance',
  ],
};

/**
 * What the brief is asking for.
 *
 * This is the seam. Today it reads keywords; a language model would replace
 * the body and keep the shape, returning the same `BriefReading` with `by`
 * set to 'model'. Everything downstream — the candidate set, the ranking, the
 * evidence on every card — is Pokter's and stays Pokter's either way. A model
 * gets to interpret the question. It does not get to decide what is true about
 * an agent, because the moment it does, the product is repeating claims again
 * instead of checking them.
 */
/**
 * Where each signal occurs in the text.
 *
 * Signals were counted per category, one point each, and ties went to
 * whichever category is listed first. "safe" (health factor) sits inside
 * "safe to buy" and "safety" (token safety), so "Check if a token is safe
 * to buy" — one of the home page's own example searches — tied one-all and
 * was read as Health Factor. A signal now counts only where no longer
 * matched signal covers it, and a category scores the length of what it
 * matched, so the more specific phrase wins.
 */
function occurrences(text: string, signal: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (let at = text.indexOf(signal); at !== -1; at = text.indexOf(signal, at + 1)) spans.push([at, at + signal.length]);
  return spans;
}

export function interpretBrief(brief: string): BriefReading {
  const text = brief.toLowerCase();

  const found = CATEGORIES.flatMap((category) =>
    SIGNALS[category.id].flatMap((signal) => occurrences(text, signal).map(([start, end]) => ({ category, signal, start, end }))),
  );
  // A match lying entirely inside a longer match (of any category) is part of that phrase, not a signal of its own.
  const standing = found.filter(
    (m) => !found.some((other) => other !== m && other.end - other.start > m.end - m.start && other.start <= m.start && other.end >= m.end),
  );

  const scored = CATEGORIES.map((category) => {
    const mine = standing.filter((m) => m.category.id === category.id);
    const matched = [...new Set(mine.map((m) => m.signal))];
    return { id: category.id, label: category.label, matched, weight: matched.reduce((sum, signal) => sum + signal.length, 0) };
  })
    .filter((entry) => entry.matched.length > 0)
    .sort((a, b) => b.weight - a.weight || b.matched.length - a.matched.length);

  const [best] = scored;

  if (!best) {
    return {
      category: null,
      because:
        'Nothing in this brief matched a category Pokter measures, so the whole indexed set is shown instead of a guess.',
      matched: [],
      by: 'keywords',
    };
  }

  return {
    category: best.id,
    because: `Read as ${best.label} from ${best.matched.length === 1 ? 'the term' : 'the terms'} below.`,
    matched: best.matched,
    by: 'keywords',
  };
}
