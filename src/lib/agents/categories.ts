import type { ScanAgent, ScanAgentDetail } from '@/lib/scan/types';

/**
 * Classification works off list rows and full detail alike; detail rows simply
 * carry `tags`, which is the strongest signal we have.
 */
export type ClassifiableAgent = ScanAgent | ScanAgentDetail;

/**
 * The four agent categories the marketplace must treat equally.
 * `unclassified` is deliberately not a fifth category — it is the holding pen
 * for registry noise that does not belong in the marketplace at all.
 */
export type Category =
  | 'rebalancing'
  | 'grid-trading'
  | 'yield'
  | 'health-factor';

export type Classification = Category | 'unclassified';

export interface CategoryMeta {
  id: Category;
  label: string;
  /** What this kind of agent does, in the user's terms. */
  blurb: string;
  /** The question a user is really asking when they browse this category. */
  question: string;
  accent: string;
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'rebalancing',
    label: 'Rebalancing',
    blurb: 'Keeps your portfolio at target weights as prices drift.',
    question: 'Would this have kept my allocation on target without overtrading?',
    accent: 'sky',
  },
  {
    id: 'grid-trading',
    label: 'Grid Trading',
    blurb: 'Runs a buy-low/sell-high ladder inside a price range.',
    question: 'Does its range still match how this market is actually moving?',
    accent: 'violet',
  },
  {
    id: 'yield',
    label: 'Yield Optimisation',
    blurb: 'Moves capital toward the best risk-adjusted yield available.',
    question: 'Is it chasing headline APY, or net of gas and impermanent loss?',
    accent: 'emerald',
  },
  {
    id: 'health-factor',
    label: 'Health Factor',
    blurb: 'Watches loan positions and acts before liquidation.',
    question: 'How early does it act, and has it ever been late?',
    accent: 'amber',
  },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/**
 * Keyword evidence per category. Ordered by strength: a term in `strong` is
 * close to decisive, `weak` terms only matter in combination.
 */
const SIGNALS: Record<Category, { strong: string[]; weak: string[] }> = {
  rebalancing: {
    strong: ['rebalanc', 'portfolio weight', 'target allocation', 'drift'],
    weak: ['portfolio', 'allocation', 'index', 'basket', 'weighting'],
  },
  'grid-trading': {
    strong: ['grid trad', 'grid bot', 'grid strategy', 'dca bot'],
    weak: ['grid', 'range', 'ladder', 'market making', 'spread', 'dca'],
  },
  yield: {
    strong: ['yield optimi', 'yield aggregat', 'auto-compound', 'autocompound', 'apy optimi'],
    weak: ['yield', 'apy', 'apr', 'farming', 'staking', 'vault', 'lending', 'compound'],
  },
  'health-factor': {
    strong: [
      'health factor',
      'liquidation protect',
      'anti liquidation',
      'liquidation risk',
      'loan health',
      'lending position',
      'collateral ratio',
    ],
    weak: ['liquidation', 'collateral', 'ltv', 'borrow', 'loan', 'margin call', 'monitor'],
  },
};

export interface CategoryScore {
  category: Category;
  confidence: number;
  /** The exact terms that drove the match, so the UI can show its working. */
  matched: string[];
}

/**
 * Registry text arrives with separators baked into names ("yield-optimizer.agent",
 * "bnb_lending_guardian"), which would hide multi-word signals like "yield optimi".
 * Flattening separators to spaces is what lets those match.
 */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[-_./]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Text we are willing to classify on, split by trustworthiness.
 *
 * Tags are publisher-declared and structured, so they are the strongest signal
 * available — an agent tagged `health-factor` is telling us its category
 * outright. Name and description are prose and treated as weaker evidence.
 */
function corpusFor(agent: ClassifiableAgent): { tags: string; text: string } {
  return {
    tags: normalise((agent.tags ?? []).join(' ')),
    text: normalise(`${agent.name} ${agent.description ?? ''}`),
  };
}

/**
 * Score an agent against every category. Returns all non-zero matches, sorted,
 * because an agent can legitimately span two (a yield vault that also
 * rebalances) and the UI should be able to say so.
 */
export function scoreCategories(agent: ClassifiableAgent): CategoryScore[] {
  const { tags, text } = corpusFor(agent);

  return CATEGORIES.map(({ id }) => {
    const { strong, weak } = SIGNALS[id];

    const tagStrong = strong.filter((term) => tags.includes(term));
    const tagWeak = weak.filter((term) => tags.includes(term));
    const textStrong = strong.filter((term) => text.includes(term));
    const textWeak = weak.filter((term) => text.includes(term));

    // A declared tag is close to decisive on its own. Prose evidence
    // accumulates but saturates, so keyword-stuffed descriptions cannot
    // outrank an agent that simply says what it is.
    const confidence = Math.min(
      1,
      tagStrong.length * 0.9 +
        Math.min(tagWeak.length, 2) * 0.2 +
        textStrong.length * 0.6 +
        Math.min(textWeak.length, 3) * 0.15,
    );

    const matched = [...new Set([...tagStrong, ...tagWeak, ...textStrong, ...textWeak])];
    return { category: id, confidence, matched };
  })
    .filter((s) => s.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
}

/** Minimum confidence before we will place an agent in a category at all. */
const CLASSIFY_THRESHOLD = 0.3;

export function classify(agent: ClassifiableAgent): Classification {
  const [best] = scoreCategories(agent);
  if (!best || best.confidence < CLASSIFY_THRESHOLD) return 'unclassified';
  return best.category;
}
