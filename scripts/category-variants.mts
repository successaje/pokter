/**
 * Proposed category rules, and the dry run that measures them against the
 * rules in production.
 *
 * The production classifier (`src/lib/agents/categories.ts`) places an
 * agent in a category once its keyword confidence reaches 0.3. Two kinds of
 * thin evidence clear that bar on their own: one strong term anywhere in
 * the prose (0.6), and one weak term in the name (0.35 for the name, plus
 * 0.15 because the name is also prose). Both have filed agents under a
 * category they do not work in, and a buyer browsing that category is then
 * shown an agent that cannot do the job, beside a Pokter claim that it was
 * placed there on evidence.
 *
 * Changing the rule moves agents, and moving agents is a cost as well as a
 * fix: an agent that loses its category leaves the category listings, and
 * unless it has signed a price, the catalogue with them. So a
 * rule change has to be argued from what it does to the real catalogue,
 * agent by agent, before it goes anywhere near production. This module is
 * that argument. It is deliberately outside `src/`: nothing that ships may
 * import from `scripts/` (`tests/docker-context.test.mts`), so no variant
 * here can change what the site does.
 *
 * The production decision is always taken from production's own `classify`
 * and `scoreCategories`. The term-by-term working comes from a mirror of the
 * production scorer, because production reports only a flat list of
 * matched terms and not where each one was found. The mirror is checked
 * against production on every agent the dry run reads, and the report says
 * so; a mirror that disagreed would be reported, not trusted.
 */
import {
  CATEGORIES,
  classify,
  scoreCategories,
  type Category,
  type ClassifiableAgent,
  type Classification,
} from '../src/lib/agents/categories';

/* ---------------------------------------------------------------------------
 * The production scorer, mirrored
 * ------------------------------------------------------------------------- */

/**
 * A copy of `SIGNALS` in `src/lib/agents/categories.ts`, which is not
 * exported. The dry-run test compares this with the source text, so the
 * copy cannot drift without a failing test.
 */
export const SIGNALS: Record<Category, { strong: string[]; weak: string[] }> = {
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
  'token-safety': {
    strong: [
      'honeypot',
      'rug pull',
      'rugpull',
      'token safety',
      'contract safety',
      'pre-trade safety',
      'sell tax',
      'buy tax',
      'mint authority',
      'can i sell',
      'sellability',
    ],
    weak: [
      'bep-20',
      'bep20',
      'erc-20',
      'scam',
      'risk signal',
      'lp lock',
      'liquidity lock',
      'ownership renounc',
      'proxy',
      'blacklist',
      'screen',
      'holder',
    ],
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

/** Production's threshold, unchanged by every variant here. */
export const CLASSIFY_THRESHOLD = 0.3;

/** Production's text normalisation, copied exactly. */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/[-_./]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Where a term was found. `description` means the description alone, not the name. */
export type Field = 'tag' | 'name' | 'description';

export interface TermHit {
  term: string;
  strength: 'strong' | 'weak';
  fields: Field[];
  /**
   * False for a weak term found only inside a strong term that also
   * matched: "grid" inside "grid trading" is one piece of evidence, not two.
   */
  independent: boolean;
}

export interface CategoryEvidence {
  category: Category;
  /** Production's confidence formula, over the terms this matching mode finds. */
  confidence: number;
  /** In production's order, so it can be compared with `scoreCategories`. */
  matched: string[];
  hits: TermHit[];
}

/**
 * How a term is found in text.
 *
 * `substring` is production: "apr" is found in "approach" and "range" in
 * "arrange". `word-start` finds a term only where a word begins, so stems
 * such as "rebalanc" still match "rebalancing" but no term matches from the
 * middle of an unrelated word.
 */
export type Matching = 'substring' | 'word-start';

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function finder(matching: Matching): (haystack: string, term: string) => boolean {
  if (matching === 'substring') return (haystack, term) => haystack.includes(term);
  return (haystack, term) => new RegExp(`(?:^|[^a-z0-9])${escape(term)}`).test(haystack);
}

function masker(matching: Matching): (haystack: string, term: string) => string {
  if (matching === 'substring') return (haystack, term) => haystack.split(term).join(' \u0000 ');
  return (haystack, term) => haystack.replace(new RegExp(`(^|[^a-z0-9])${escape(term)}`, 'g'), '$1 \u0000 ');
}

/**
 * Score an agent against every category, with the working.
 *
 * With `substring` matching this returns exactly what production's
 * `scoreCategories` returns (category, confidence, matched terms, order),
 * plus where each term was found.
 */
export function evidenceFor(agent: ClassifiableAgent, matching: Matching = 'substring'): CategoryEvidence[] {
  const has = finder(matching);
  const mask = masker(matching);
  const tags = normalise((agent.tags ?? []).join(' '));
  const name = normalise(agent.name);
  const description = normalise(agent.description ?? '');
  /* Production scores prose as the name and description together. */
  const text = normalise(`${agent.name} ${agent.description ?? ''}`);

  return CATEGORIES.map(({ id }) => {
    const { strong, weak } = SIGNALS[id];
    const tagStrong = strong.filter((term) => has(tags, term));
    const tagWeak = weak.filter((term) => has(tags, term));
    const nameStrong = strong.filter((term) => has(name, term));
    const nameWeak = weak.filter((term) => has(name, term));
    const textStrong = strong.filter((term) => has(text, term));
    const textWeak = weak.filter((term) => has(text, term));

    const confidence = Math.min(
      1,
      tagStrong.length * 0.9 +
        Math.min(tagWeak.length, 2) * 0.2 +
        nameStrong.length * 0.7 +
        Math.min(nameWeak.length, 2) * 0.35 +
        textStrong.length * 0.6 +
        Math.min(textWeak.length, 3) * 0.15,
    );
    const matched = [...new Set([...tagStrong, ...tagWeak, ...nameStrong, ...nameWeak, ...textStrong, ...textWeak])];

    const maskedText = textStrong.reduce(mask, text);
    const maskedTags = tagStrong.reduce(mask, tags);
    const hits: TermHit[] = matched.map((term) => {
      const isStrong = strong.includes(term);
      const fields: Field[] = [];
      if (has(tags, term)) fields.push('tag');
      if (has(name, term)) fields.push('name');
      if (has(description, term)) fields.push('description');
      /* Found only across the join of name and description. */
      if (!fields.includes('name') && !fields.includes('description') && has(text, term)) fields.push('name', 'description');
      return {
        term,
        strength: isStrong ? 'strong' : 'weak',
        fields,
        independent: isStrong || has(maskedText, term) || has(maskedTags, term),
      };
    });
    return { category: id, confidence, matched, hits };
  })
    .filter((e) => e.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
}

/* ---------------------------------------------------------------------------
 * Rule sets
 * ------------------------------------------------------------------------- */

export interface RuleSet {
  id: string;
  label: string;
  /** The rule in one sentence, as a reviewer would check it against the code. */
  rule: string;
  matching: Matching;
  /**
   * A condition a category's evidence must meet, on top of the threshold.
   * A category that fails it is skipped and the next one is considered, so
   * an agent can move category as well as lose one. `prose` is the
   * normalised name and description, as production scores them.
   */
  admits?: (evidence: CategoryEvidence, prose: string) => boolean;
  /** Take the decision from production's own `classify`, with the mirror supplying only the working. */
  production?: true;
}

export interface Decision {
  category: Classification;
  /** The evidence behind the decision; null when unclassified. */
  evidence: CategoryEvidence | null;
  /** The best-scoring category, admitted or not, so an unclassified result can show what it turned down. */
  strongest: CategoryEvidence | null;
}

export function decide(agent: ClassifiableAgent, rules: RuleSet): Decision {
  const scored = evidenceFor(agent, rules.matching);
  if (rules.production) {
    const category = classify(agent);
    return { category, evidence: scored.find((e) => e.category === category) ?? null, strongest: scored[0] ?? null };
  }
  const prose = normalise(`${agent.name} ${agent.description ?? ''}`);
  const admitted = scored.find((e) => e.confidence >= CLASSIFY_THRESHOLD && (rules.admits?.(e, prose) ?? true));
  return { category: admitted?.category ?? 'unclassified', evidence: admitted ?? null, strongest: scored[0] ?? null };
}

const declared = (e: CategoryEvidence) => e.hits.some((h) => h.fields.includes('tag'));
/** Distinct terms found in the name or description, each counted once, overlaps counted once. */
const proseTerms = (e: CategoryEvidence) =>
  e.hits.filter((h) => h.independent && (h.fields.includes('name') || h.fields.includes('description')));
/** The one piece of evidence, when there is exactly one. */
const loneTerm = (e: CategoryEvidence): TermHit | null => {
  const terms = e.hits.filter((h) => h.independent);
  return terms.length === 1 ? terms[0] : null;
};
const loneWeakNameTerm = (e: CategoryEvidence) => {
  const only = loneTerm(e);
  return only !== null && only.strength === 'weak' && only.fields.includes('name');
};

/**
 * The weak terms that are the category's own name.
 *
 * "Gridwright", "Mandate Grid-1", "Fee Yield Scout" and "yieldrouter" say
 * what they are with one weak word because that word is what the category
 * is called. "Beta Ladder", "BORT Vault Guardian" and "recurring
 * monitoring service" do not: a ladder, a vault and a monitor are all
 * things an agent outside the category can be named after. The other three
 * categories are named by strong terms already.
 */
export const CATEGORY_WORDS: Record<Category, string[]> = {
  rebalancing: [],
  'grid-trading': ['grid'],
  yield: ['yield'],
  'health-factor': [],
  'token-safety': [],
};

/**
 * Strong terms with an everyday sense outside finance, and what they must be
 * said of to count alone.
 *
 * "Rebalancing" and "drift" are decisive when they are about a portfolio or
 * a liquidity position and meaningless otherwise: one of the misfiles is a
 * metaphysics agent practising "polarity diagnosis and rebalancing". The
 * other strong terms ("health factor", "token safety", "honeypot", "yield
 * optimi…") have no sense outside the category, so they are left alone.
 *
 * `objects` is D's test. It proved too narrow on the snapshot of 1
 * November: it also drops rebalancers of stocks, vaults and DeFi
 * protocols. F widens it to `MONEY_WORDS`.
 */
export const EVERYDAY_STRONG: Partial<Record<Category, { terms: string[]; objects: string[] }>> = {
  rebalancing: {
    terms: ['rebalanc', 'drift'],
    objects: ['portfolio', 'allocation', 'weight', 'position', 'liquidity', 'range', 'pool', 'lp', 'basket', 'index', 'tick', 'asset'],
  },
};

/**
 * What a lone "rebalancing" or "drift" must be said in to count, under F:
 * money, rather than one of the objects D names.
 *
 * D's list was drawn from liquidity rebalancers, and in this registry the
 * two words are financial far more often than not. Rebalancers of other
 * holdings name what they rebalance in other words: a desk selling
 * "rebalance plans" for "tokenized US stocks", a keeper that "rebalances
 * 24/7" a set of "savings vaults" and lending legs, "automated rebalancing"
 * for "DeFi protocols". D drops all three. F keeps D's list and adds the
 * other things money is held in (a vault, a stock or equity, capital, a
 * treasury) and the places it is held (DeFi, a DEX, lending), so the
 * everyday sense is recognised by money being absent from the prose. The
 * Yin Yang agents show what that looks like: their one money word is the
 * token they are paid in.
 *
 * Words for being paid ("token", "paid", "funded", "per job") are left out
 * on purpose. Every agent on the chain says how it is paid, so they say
 * nothing about what it rebalances. "Holding" is left out because it has
 * an everyday sense of its own.
 */
export const MONEY_WORDS: Partial<Record<Category, string[]>> = {
  rebalancing: [...(EVERYDAY_STRONG.rebalancing?.objects ?? []), 'vault', 'stock', 'equit', 'capital', 'treasur', 'defi', 'dex', 'lending'],
};

const startsWord = finder('word-start');

const D_ANCHORS: Partial<Record<Category, string[]>> = Object.fromEntries(
  Object.entries(EVERYDAY_STRONG).map(([category, everyday]) => [category, everyday?.objects ?? []]),
);

/**
 * A lone everyday-sense strong term, found only in the description, with
 * none of the anchor words anywhere in the prose: under D the objects
 * `EVERYDAY_STRONG` lists, under F any of `MONEY_WORDS`.
 */
const unanchoredEverydayTerm = (e: CategoryEvidence, prose: string, anchors: Partial<Record<Category, string[]>> = D_ANCHORS) => {
  const everyday = EVERYDAY_STRONG[e.category];
  const only = loneTerm(e);
  if (!everyday || !only || !everyday.terms.includes(only.term) || only.fields.includes('name')) return false;
  return !(anchors[e.category] ?? everyday.objects).some((anchor) => startsWord(prose, anchor));
};

/**
 * Strong terms that name one check rather than the service.
 *
 * Sniping and trading bots run a honeypot test before they buy and say so
 * in their description, as a step of their own trading. So one of these,
 * as the only token-safety term in the description, is read as a feature
 * of an agent in some other line of work. Terms that name the service
 * itself ("token safety", "contract safety", "can i sell") still stand
 * alone, and so does a check in the name or a tag.
 *
 * The condition counts matched terms, not the checks an agent describes.
 * moneyclaw names four ("honeypots, high transaction taxes, unlocked
 * liquidity, and malicious functions") and is read out of token safety
 * only because three of them are worded outside the term list; a term
 * added for any of them would bring it back.
 */
export const SINGLE_CHECKS: Partial<Record<Category, string[]>> = {
  'token-safety': ['honeypot', 'rug pull', 'rugpull', 'sell tax', 'buy tax', 'mint authority'],
};

/** One named check, alone in the description, with nothing else the category's own. */
const loneCheck = (e: CategoryEvidence) => {
  const only = loneTerm(e);
  return only !== null && (SINGLE_CHECKS[e.category] ?? []).includes(only.term) && !only.fields.includes('name');
};

const namesItsCategory = (e: CategoryEvidence) => {
  const only = loneTerm(e);
  return only !== null && CATEGORY_WORDS[e.category].includes(only.term);
};

export const PRODUCTION: RuleSet = {
  id: 'production',
  label: 'Production rules (mirror)',
  rule: 'Highest keyword confidence wins once it reaches 0.3; terms match anywhere in a word.',
  matching: 'substring',
  production: true,
};

export const VARIANTS: RuleSet[] = [
  {
    id: 'a-no-lone-weak-name',
    label: 'A: a lone weak name term no longer classifies',
    rule:
      'As production, except a category whose only evidence is one weak term that appears in the name is not admitted, unless a declared tag matches.',
    matching: 'substring',
    admits: (e) => declared(e) || !loneWeakNameTerm(e),
  },
  {
    id: 'b-two-prose-terms',
    label: 'B: prose needs two distinct terms',
    rule:
      'As production, except that without a matching declared tag a category needs at least two distinct terms across the name and description (a strong and a weak, two strong, or two weak); a weak term found only inside a matched strong term does not count twice.',
    matching: 'substring',
    admits: (e) => declared(e) || proseTerms(e).length >= 2,
  },
  {
    id: 'c-lone-name-word-must-name-category',
    label: "C: a lone weak name term counts only when it is the category's own word",
    rule:
      'As A, except a lone weak name term is still admitted when it is the word the category is named for ("grid" for grid trading, "yield" for yield).',
    matching: 'substring',
    admits: (e) => declared(e) || !loneWeakNameTerm(e) || namesItsCategory(e),
  },
  {
    id: 'd-c-plus-anchored-everyday-terms',
    label: 'D: C, and "rebalancing" or "drift" alone must be said of something rebalanced',
    rule:
      'As C, and when the only evidence is "rebalanc" or "drift" in the description (not the name, no tag), the prose must also name what is rebalanced: a portfolio, allocation, weight, position, liquidity, range, pool, LP, basket, index, tick or asset.',
    matching: 'substring',
    admits: (e, prose) => declared(e) || ((!loneWeakNameTerm(e) || namesItsCategory(e)) && !unanchoredEverydayTerm(e, prose)),
  },
  {
    id: 'e-d-plus-single-check',
    label: 'E: D, and one named safety check alone is a feature, not the category',
    rule:
      'As D, and when the only evidence is one named check ("honeypot", "rug pull", "sell tax", "buy tax", "mint authority") in the description, token safety is not admitted; a second token-safety term, the name or a tag still admits it.',
    matching: 'substring',
    admits: (e, prose) =>
      declared(e) || ((!loneWeakNameTerm(e) || namesItsCategory(e)) && !unanchoredEverydayTerm(e, prose) && !loneCheck(e)),
  },
  {
    id: 'f-e-with-money-context',
    label: 'F: E, with "rebalancing" or "drift" alone counting wherever the prose is about money',
    rule:
      'As E, except that a lone "rebalanc" or "drift" in the description (not the name, no tag) is admitted when the prose names anything money is held in or at: D\'s list, or a vault, stock, equity, capital, treasury, DeFi, a DEX or lending. Words for being paid ("token", "paid", "funded") do not count.',
    matching: 'substring',
    admits: (e, prose) =>
      declared(e) ||
      ((!loneWeakNameTerm(e) || namesItsCategory(e)) && !unanchoredEverydayTerm(e, prose, MONEY_WORDS) && !loneCheck(e)),
  },
];

/**
 * Terms production can never match.
 *
 * Text is normalised before matching, which turns every hyphen into a
 * space, but the terms are not, so a term written with a hyphen is looked
 * for in text that cannot contain it.
 */
export function deadTerms(): Array<{ category: Category; term: string; normalised: string }> {
  return CATEGORIES.flatMap(({ id }) =>
    [...SIGNALS[id].strong, ...SIGNALS[id].weak]
      .filter((term) => normalise(term) !== term)
      .map((term) => ({ category: id, term, normalised: normalise(term) })),
  );
}

/* ---------------------------------------------------------------------------
 * The dry run
 * ------------------------------------------------------------------------- */

/** The fields of a snapshot agent the dry run reads. See `scripts/category-snapshot.mts`. */
export interface DryRunAgent {
  chainId: number;
  tokenId: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  listed?: boolean;
  liveCategory?: Classification | null;
  signedPrice?: boolean | null;
  surfacedBy?: Category[];
  /** For an agent read outside a snapshot: which record to classify. Defaults to the full record. */
  view?: RecordView;
}

export const keyOf = (agent: { chainId: number; tokenId: string }) => `${agent.chainId}:${agent.tokenId}`;

/**
 * Which record the catalogue classified.
 *
 * Category listings are built from the indexer's list rows, which carry no
 * tags. Agents added because they signed a price, or because Pokter
 * enrolled them, are read from the full record, which does. A snapshot
 * cannot see which way an agent came in, so the view is the one whose
 * production category matches what the catalogue showed, list row first,
 * since that is how nearly every agent is listed. An agent neither
 * explains is reported.
 */
export type RecordView = 'list-row' | 'record' | 'unexplained';

export function asClassified(agent: DryRunAgent, view: RecordView): ClassifiableAgent {
  return {
    name: agent.name,
    description: agent.description,
    tags: view === 'list-row' ? undefined : agent.tags,
  } as unknown as ClassifiableAgent;
}

export function viewFor(agent: DryRunAgent): RecordView {
  const live = agent.liveCategory;
  if (!agent.listed || live === null || live === undefined) return 'list-row';
  if (classify(asClassified(agent, 'list-row')) === live) return 'list-row';
  if (classify(asClassified(agent, 'record')) === live) return 'record';
  return 'unexplained';
}

/** Not in the catalogue at all: in no category listing, and not added on a signed price or enrolment. */
export const NOT_LISTED = 'not listed';
export type Shown = Classification | typeof NOT_LISTED;

export interface Placement {
  shownAs: Shown;
  /**
   * `listing`: a category listing found it and its list row classified
   * into that category. `record`: added on a signed price or enrolment and
   * classified from its full record, tags included.
   */
  via: 'listing' | 'record' | null;
  decision: Decision;
}

export type Placer = (agent: DryRunAgent, rules: RuleSet) => Placement;

/** Classification alone, of the record the agent names (the full record unless it says list row). */
export const byClassification: Placer = (agent, rules) => {
  const decision = decide(asClassified(agent, agent.view === 'list-row' ? 'list-row' : 'record'), rules);
  return { shownAs: decision.category, via: null, decision };
};

/**
 * Where the catalogue would show an agent, modelled on how it is built
 * (`listMarketplaceWithStatus` in `src/lib/marketplace.ts`):
 *
 *  1. Each category listing keeps the agents its discovery reads return
 *     whose list row classifies into that category.
 *  2. An enrolled agent no listing kept is added under the category its
 *     full record classifies into, if any.
 *  3. An agent with a signed price no listing kept is added under whatever
 *     its full record classifies into, Unclassified included.
 *  4. Anything else is not in the catalogue.
 *
 * Enrolment is not public, so an agent is taken as enrolled only when
 * nothing else explains its being listed today. A listed agent is taken as
 * found by its own category's reads even when this snapshot's reads missed
 * it, since the catalogue evidently found it. Clone collapsing, the
 * per-owner cap and the test-identity filter are not modelled; they only
 * ever remove agents.
 */
export const inCatalogue: Placer = (agent, rules) => {
  const view = viewFor(agent);
  const found = new Set<Classification>(agent.surfacedBy ?? []);
  if (agent.listed && view === 'list-row' && agent.liveCategory) found.add(agent.liveCategory);

  const fromRow = decide(asClassified(agent, 'list-row'), rules);
  if (fromRow.category !== 'unclassified' && found.has(fromRow.category)) return { shownAs: fromRow.category, via: 'listing', decision: fromRow };

  const fromRecord = decide(asClassified(agent, 'record'), rules);
  if (agent.signedPrice) return { shownAs: fromRecord.category, via: 'record', decision: fromRecord };
  const enrolled = Boolean(agent.listed) && view === 'record';
  if (enrolled && fromRecord.category !== 'unclassified') return { shownAs: fromRecord.category, via: 'record', decision: fromRecord };
  return { shownAs: NOT_LISTED, via: null, decision: fromRow };
};

export interface TermReport {
  term: string;
  strength: 'strong' | 'weak';
  fields: Field[];
  independent: boolean;
}

export interface Change {
  key: string;
  name: string;
  from: Shown;
  to: Shown;
  fromVia: Placement['via'];
  toVia: Placement['via'];
  /** The terms behind the current decision (production). */
  fromTerms: TermReport[];
  fromConfidence: number | null;
  /** The terms behind the proposed decision; when it has no category, those of the category it declined. */
  toTerms: TermReport[];
  toConfidence: number | null;
  /** When the proposed decision has no category: the category the rule declined. */
  declined: Category | null;
  /** The category the proposed rules gave the record they read, which a listing may still not have found. */
  decided: Classification;
  signedPrice: boolean | null;
}

export type Counts = Record<Shown, number>;

export function emptyCounts(): Counts {
  return { 'health-factor': 0, rebalancing: 0, 'grid-trading': 0, yield: 0, 'token-safety': 0, unclassified: 0, [NOT_LISTED]: 0 };
}

function termsOf(evidence: CategoryEvidence | null): TermReport[] {
  return (evidence?.hits ?? []).map(({ term, strength, fields, independent }) => ({ term, strength, fields, independent }));
}

const isCategory = (shown: Shown): shown is Category => shown !== 'unclassified' && shown !== NOT_LISTED;

/**
 * Compare two rule sets over the same agents.
 *
 * Only agents whose placement differs are returned; the counts cover every
 * agent given.
 */
export function diffClassifications(
  agents: DryRunAgent[],
  before: RuleSet,
  after: RuleSet,
  place: Placer = byClassification,
): { before: Counts; after: Counts; changes: Change[] } {
  const countsBefore = emptyCounts();
  const countsAfter = emptyCounts();
  const changes: Change[] = [];
  for (const agent of agents) {
    const was = place(agent, before);
    const now = place(agent, after);
    countsBefore[was.shownAs] += 1;
    countsAfter[now.shownAs] += 1;
    if (was.shownAs === now.shownAs) continue;
    const declined = now.decision.evidence ? null : (was.decision.evidence?.category ?? null);
    /* With no category, show the evidence it turned down for the category it had. */
    const shown = now.decision.evidence ?? (declined ? (evidenceFor(asClassified(agent, now.via === 'record' ? 'record' : 'list-row'), after.matching).find((e) => e.category === declined) ?? null) : now.decision.strongest);
    changes.push({
      key: keyOf(agent),
      name: agent.name,
      from: was.shownAs,
      to: now.shownAs,
      fromVia: was.via,
      toVia: now.via,
      fromTerms: termsOf(was.decision.evidence),
      fromConfidence: was.decision.evidence?.confidence ?? null,
      toTerms: termsOf(shown),
      toConfidence: shown?.confidence ?? null,
      declined,
      decided: now.decision.category,
      signedPrice: agent.signedPrice ?? null,
    });
  }
  const order = (shown: Shown) => [...CATEGORIES.map((c) => c.id as Shown), 'unclassified', NOT_LISTED].indexOf(shown);
  changes.sort((a, b) => order(a.from) - order(b.from) || order(a.to) - order(b.to) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  return { before: countsBefore, after: countsAfter, changes };
}

/* ---------------------------------------------------------------------------
 * The review set
 * ------------------------------------------------------------------------- */

export interface ReviewEntry extends DryRunAgent {
  /** What production does with this agent today. Pinned by the test. */
  current: Classification;
  /** What we believe is right. Not confirmed until `reviewed` is true. */
  expected: Classification;
  kind: 'misfile' | 'guard';
  why: string;
  reviewed: boolean;
  /** Which record the catalogue classifies for this agent; see `RecordView`. Defaults to the full record. */
  view?: RecordView;
}

export interface ReviewScore {
  /** Misfiles the rule files where we expect. */
  fixed: string[];
  /** Misfiles the rule still gets wrong. */
  unfixed: string[];
  /** Guards the rule still files where we expect. */
  kept: string[];
  /** Guards the rule now gets wrong. */
  broken: string[];
}

export function scoreReviewSet(entries: ReviewEntry[], rules: RuleSet): ReviewScore {
  const score: ReviewScore = { fixed: [], unfixed: [], kept: [], broken: [] };
  for (const entry of entries) {
    /* Placed as the catalogue would place it when the entry says how it is listed; "no category" is met by leaving the catalogue too. */
    const placed = (entry.listed === undefined ? byClassification : inCatalogue)(entry, rules).shownAs;
    const got = placed === NOT_LISTED ? 'unclassified' : placed;
    const label = `${entry.name} (${keyOf(entry)})`;
    if (entry.kind === 'misfile') (got === entry.expected ? score.fixed : score.unfixed).push(label);
    else (got === entry.expected ? score.kept : score.broken).push(label);
  }
  return score;
}

/* ---------------------------------------------------------------------------
 * The report
 * ------------------------------------------------------------------------- */

export interface VariantResult {
  id: string;
  label: string;
  rule: string;
  counts: {
    before: Counts;
    after: Counts;
    /**
     * The alternative to removal: every listed agent the rule would take
     * out of the catalogue stays in it as Unclassified instead. Production
     * cannot do this today (see `renderMarkdown`, "Leaving the catalogue").
     */
    ifKept: Counts;
  };
  changes: Change[];
  summary: {
    changed: number;
    /** Listed under a category today, and under none after. */
    lostCategory: number;
    /** Of those, still in the catalogue as Unclassified (they have signed a price). */
    lostCategoryStillListed: number;
    /** Of those, no longer in the catalogue at all. */
    lostCategoryLeaves: number;
    movedCategory: number;
    gainedCategory: number;
  };
  /** Agents outside the catalogue today that this rule would place in a category listing. */
  wouldJoin: Array<{ key: string; name: string; category: Category; terms: TermReport[] }>;
  /**
   * Every agent read, in the catalogue or not, whose list row this rule
   * classifies differently from production: the rule's reach over the
   * registry rather than over today's listings, so a misfile or a false
   * negative among agents not listed yet still shows.
   */
  reclassified: Array<{ key: string; name: string; listed: boolean; from: Classification; to: Classification }>;
  review: ReviewScore | null;
}

export interface DryRunReport {
  schema: 'pokter.category-dry-run/v1';
  generatedAt: string;
  input: { path: string; takenAt: string | null; sources: Record<string, string> | null; agents: number; listed: number };
  checks: {
    /** Production's classifier, placed by the catalogue model, against what the catalogue showed. */
    liveReproduced: { matched: number; of: number; byRecord: string[]; unexplained: string[] };
    /** Agents outside the catalogue that the model would list under production (clone collapse, the per-owner cap and the test-identity filter are not modelled). */
    modelOverlists: number;
    /** The mirror against production's `scoreCategories` and `classify`, on every record read. */
    mirrorParity: { matched: number; of: number; mismatches: string[] };
    /** Agents listed from their list row whose full record (with tags) classifies differently, so their profile and their listing disagree today. */
    profileDisagrees: Array<{ key: string; name: string; listing: Classification; profile: Classification; tags: string[] }>;
    /** Categorised agents listed from their list row, and how many this snapshot's own discovery reads returned for that category. */
    discovery: { listRowAgents: number; foundByOwnListing: number };
    /** Listed agents whose registry record carries any tag at all. */
    tagged: number;
    /** Terms production can never match, and how many agents' text holds what they were meant to find. */
    deadTerms: Array<{ category: Category; term: string; normalised: string; agents: number }>;
    /**
     * Agents this snapshot's discovery reads returned that production
     * leaves out of the catalogue as Unclassified: what a policy of keeping
     * discovered agents listed as Unclassified would also have to list.
     */
    unclassifiedDiscovered: number;
  };
  liveCounts: Record<string, number> | null;
  variants: VariantResult[];
  recommendation: { variant: string; reasons: string[]; costs: string[]; against: string[] };
}

/** The mirror and production agree on the scores, the terms, their order, and the decision. */
export function mirrorAgrees(agent: ClassifiableAgent): boolean {
  const mine = evidenceFor(agent, 'substring').map(({ category, confidence, matched }) => ({ category, confidence, matched }));
  const mirror: RuleSet = { ...PRODUCTION, production: undefined };
  return JSON.stringify(mine) === JSON.stringify(scoreCategories(agent)) && decide(agent, mirror).category === classify(agent);
}

export function runDryRun(
  snapshot: { takenAt?: string; sources?: Record<string, string>; liveCounts?: Record<string, number>; agents: DryRunAgent[] },
  options: { path: string; variants?: RuleSet[]; review?: ReviewEntry[]; recommend?: string; now?: Date },
): DryRunReport {
  const variants = options.variants ?? VARIANTS;
  const listed = snapshot.agents.filter((a) => a.listed);
  const candidates = snapshot.agents.filter((a) => !a.listed);

  const placedNow = new Map(snapshot.agents.map((a) => [keyOf(a), inCatalogue(a, PRODUCTION)]));
  const now = (a: DryRunAgent) => placedNow.get(keyOf(a))!;
  const byRecord = listed.filter((a) => now(a).via === 'record').map((a) => `${a.name} (${keyOf(a)}): ${a.liveCategory}${a.signedPrice ? ', signed price' : ', taken as enrolled'}`);
  const unexplained = listed
    .filter((a) => now(a).shownAs !== a.liveCategory)
    .map((a) => `${a.name} (${keyOf(a)}): live ${a.liveCategory}, modelled ${now(a).shownAs}`);

  const parityMisses: string[] = [];
  let parityChecked = 0;
  for (const agent of snapshot.agents) {
    for (const v of ['list-row', 'record'] as const) {
      parityChecked += 1;
      if (!mirrorAgrees(asClassified(agent, v))) parityMisses.push(`${agent.name} (${keyOf(agent)}, ${v})`);
    }
  }

  const fromListing = listed.filter((a) => now(a).via === 'listing');
  const profileDisagrees = fromListing
    .map((a) => ({ a, profile: classify(asClassified(a, 'record')) }))
    .filter(({ a, profile }) => profile !== a.liveCategory)
    .map(({ a, profile }) => ({ key: keyOf(a), name: a.name, listing: a.liveCategory as Classification, profile, tags: a.tags ?? [] }));

  const results: VariantResult[] = variants.map((rules) => {
    const { before, after, changes } = diffClassifications(listed, PRODUCTION, rules, inCatalogue);
    const wouldJoin = candidates.flatMap((agent) => {
      const placed = inCatalogue(agent, rules);
      if (!isCategory(placed.shownAs) || placed.shownAs === now(agent).shownAs) return [];
      return [{ key: keyOf(agent), name: agent.name, category: placed.shownAs, terms: termsOf(placed.decision.evidence) }];
    });
    const reclassified = snapshot.agents.flatMap((agent) => {
      const row = asClassified(agent, 'list-row');
      const from = classify(row);
      const to = decide(row, rules).category;
      return from === to ? [] : [{ key: keyOf(agent), name: agent.name, listed: Boolean(agent.listed), from, to }];
    });
    const lost = changes.filter((c) => isCategory(c.from) && !isCategory(c.to));
    const ifKept: Counts = { ...after, unclassified: after.unclassified + after[NOT_LISTED], [NOT_LISTED]: 0 };
    return {
      id: rules.id,
      label: rules.label,
      rule: rules.rule,
      counts: { before, after, ifKept },
      changes,
      summary: {
        changed: changes.length,
        lostCategory: lost.length,
        lostCategoryStillListed: lost.filter((c) => c.to === 'unclassified').length,
        lostCategoryLeaves: lost.filter((c) => c.to === NOT_LISTED).length,
        movedCategory: changes.filter((c) => isCategory(c.from) && isCategory(c.to)).length,
        gainedCategory: changes.filter((c) => !isCategory(c.from) && isCategory(c.to)).length,
      },
      wouldJoin,
      reclassified,
      review: options.review ? scoreReviewSet(options.review, rules) : null,
    };
  });

  return {
    schema: 'pokter.category-dry-run/v1',
    generatedAt: (options.now ?? new Date()).toISOString(),
    input: {
      path: options.path,
      takenAt: snapshot.takenAt ?? null,
      sources: snapshot.sources ?? null,
      agents: snapshot.agents.length,
      listed: listed.length,
    },
    checks: {
      liveReproduced: { matched: listed.length - unexplained.length, of: listed.length, byRecord, unexplained },
      modelOverlists: candidates.filter((a) => now(a).shownAs !== NOT_LISTED).length,
      mirrorParity: { matched: parityChecked - parityMisses.length, of: parityChecked, mismatches: parityMisses },
      profileDisagrees,
      discovery: {
        listRowAgents: fromListing.length,
        foundByOwnListing: fromListing.filter((a) => (a.surfacedBy ?? []).includes(a.liveCategory as Category)).length,
      },
      tagged: listed.filter((a) => (a.tags ?? []).length > 0).length,
      deadTerms: deadTerms().map((d) => ({
        ...d,
        agents: snapshot.agents.filter((a) => normalise(`${a.name} ${a.description ?? ''} ${(a.tags ?? []).join(' ')}`).includes(d.normalised)).length,
      })),
      unclassifiedDiscovered: candidates.filter((a) => now(a).shownAs === NOT_LISTED && now(a).decision.category === 'unclassified').length,
    },
    liveCounts: snapshot.liveCounts ?? null,
    variants: results,
    recommendation: recommend(results, options.recommend ?? RECOMMENDED),
  };
}

/* ---------------------------------------------------------------------------
 * The recommendation
 * ------------------------------------------------------------------------- */

export const RECOMMENDED = 'f-e-with-money-context';

function recommend(results: VariantResult[], id: string): DryRunReport['recommendation'] {
  const chosen = results.find((r) => r.id === id);
  if (!chosen) return { variant: id, reasons: [`No variant named ${id} was run.`], costs: [], against: [] };
  const s = chosen.summary;
  const reasons: string[] = [];
  const costs: string[] = [];
  if (chosen.review) reasons.push(`In the review set: ${reviewLine(chosen)}`);
  reasons.push(...(RATIONALE[id] ?? []));
  costs.push(
    `${s.changed} listed agents change: ${s.lostCategory} lose their category, ${s.movedCategory} move to another, ${s.gainedCategory} gain one. Each is in the change list below and should be read before anything like this goes near production.`,
    `Of the ${s.lostCategory} that lose their category, ${s.lostCategoryStillListed} stay in the catalogue as Unclassified because they have signed a price, and ${s.lostCategoryLeaves} leave the catalogue: they drop out of Discover's browsing and counts, the category listings, the API's list, the assistant tool's task results, the leaderboard and the sitemap, but their profile pages stay up, a search for their name or ID still finds them, and Pokter keeps measuring them ("Leaving the catalogue" below).`,
  );
  if (chosen.review?.unfixed.length) costs.push(`Still misfiled: ${chosen.review.unfixed.join('; ')}.`);
  if (chosen.review?.broken.length) costs.push(`Guards it breaks: ${chosen.review.broken.join('; ')}.`);
  if (chosen.wouldJoin.length) costs.push(`${chosen.wouldJoin.length} agents outside the catalogue would join a category listing; they are listed under the variant.`);
  costs.push(...(COSTS[id] ?? []));
  const against = results
    .filter((r) => r.id !== id)
    .map((r) => {
      const wrong = r.review ? [...r.review.unfixed.map((n) => `still misfiles ${n}`), ...r.review.broken.map((n) => `breaks ${n}`)] : [];
      return [
        `${r.label}: ${r.summary.changed} agents change, ${r.summary.lostCategory} lose their category (${r.summary.lostCategoryLeaves} leave the catalogue)${r.review ? `; ${reviewLine(r)}` : '.'}`,
        ...(AGAINST[r.id] ?? []),
        wrong.length ? `In the review set it ${wrong.join('; ')}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    });
  return { variant: id, reasons, costs, against };
}

function reviewLine(r: VariantResult): string {
  const review = r.review!;
  const misfiles = review.fixed.length + review.unfixed.length;
  const guards = review.kept.length + review.broken.length;
  return `${review.fixed.length} of ${misfiles} known misfiles fixed, ${review.kept.length} of ${guards} guards kept.`;
}

/** Why the recommended variant, in product terms. Numbers come from the run itself. */
const RATIONALE: Record<string, string[]> = {
  'f-e-with-money-context': [
    "It keeps E's three conditions and corrects the one that misread specialists. E asked a lone \"rebalancing\" or \"drift\" to be said of one of the liquidity objects D lists, and so dropped a desk selling rebalance plans for tokenised stocks, a keeper that rebalances savings vaults, and an agent offering automated rebalancing for DeFi protocols. F asks only that the prose be about money at all, which those three are and the Yin Yang agents are not: their one money word is the token they are paid in, and paying words do not count.",
    "The other two conditions are E's: a name word that is not the category's own (\"ladder\", \"vault\", \"monitor\") does not classify alone, and one named safety check that a trading bot runs before its own trades (\"honeypot\") is a feature, not the category.",
    'It leaves the scorer, its weights, its threshold and every term list as they are, so a single strong term that only has a category meaning ("health factor", "token safety", "yield optimisation") still classifies on its own, which is how most correctly filed agents in this catalogue are filed.',
    "A publisher's declared tag still decides on its own wherever tags are read.",
    'On this snapshot, every agent it takes out of the catalogue is a misfile that is listed today only because of the word it was misfiled on. Leaving is what the catalogue already does with every unpriced agent in no category, and each stays findable by name, by ID and at its own page.',
  ],
  'e-d-plus-single-check': [
    "Each of its three conditions answers one way a single word misfiles an agent, and each is argued from what the word means rather than from a weight: a name word that is not the category's own (\"ladder\", \"vault\", \"monitor\"); a strong term with an everyday sense, said of nothing that can be rebalanced (\"polarity diagnosis and rebalancing\"); and one named safety check that a trading bot runs before it buys (\"honeypot\").",
    'It leaves the scorer, its weights, its threshold and every term list as they are, so a single strong term that only has a category meaning ("health factor", "token safety", "yield optimisation") still classifies on its own, which is how most correctly filed agents in this catalogue are filed.',
    "A publisher's declared tag still decides on its own wherever tags are read.",
  ],
  'd-c-plus-anchored-everyday-terms': ['Fixes the weak-name and everyday-sense failures without touching token safety.'],
  'c-lone-name-word-must-name-category': ['The smallest change that fixes the weak-name failures.'],
  'b-two-prose-terms': ['Asks for corroboration of every prose decision.'],
  'a-no-lone-weak-name': ['The narrowest version of the weak-name fix as first proposed.'],
};

const COSTS: Record<string, string[]> = {
  'f-e-with-money-context': [
    "Its money words were widened from the three finance agents E dropped, so on this snapshot they fit by construction. Each names something money is held in or at, none is a word for being paid, and the three agents are now guards in the review set so a narrower list fails visibly; but only a fresh snapshot can show whether the list is wide enough.",
    'The everyday-sense test now rests on money being absent from the prose. An agent outside finance that mentions a vault, capital, a stock or DeFi anywhere in its description would pass it; none in this snapshot does.',
    'The single-check condition counts matched terms, not the checks an agent describes. moneyclaw names four ("honeypots, high transaction taxes, unlocked liquidity, and malicious functions") and leaves token safety only because three of them are worded outside the term list; adding a term for any of them would bring it back. A token-safety specialist whose description names only a honeypot test, with nothing in its name or tags, would be dropped; none in this snapshot is.',
    "On this snapshot, the weak-name condition unclassifies recurringmonitoringserviceagent, whose name and description say nothing of loans or liquidation. Its registered skills are not in the snapshot; if they show loan monitoring, a declared tag would place it, because it has signed a price and is added on its full record.",
    'It is three conditions where A and B are one each. If that is too much to take at once, C alone is the zero-regret first step (the weak-name fix), and the other two can follow on their own dry runs.',
  ],
  'e-d-plus-single-check': [
    'The three conditions are drawn from five known misfiles. Each has a product argument, but the sample is small: the review set should grow with every misfile found, and a dry run on a fresh snapshot should come before any production change.',
    'It is three conditions where A and B are one each. If that is too much to take at once, C alone is the zero-regret first step (the weak-name fix), and D and E can follow on their own dry runs.',
  ],
};

/** Why not each of the others; the agents it gets wrong are added from the run. */
const AGAINST: Record<string, string[]> = {
  'a-no-lone-weak-name': ['It also drops agents that name their category with its own word ("grid", "yield"); C keeps them.'],
  'b-two-prose-terms': [
    "Most correctly filed agents carry exactly one strong term, so asking for two unclassifies far more good agents than bad. Its tag exemption barely reaches the listings: category listings classify the indexer's list rows, which carry no tags, so a tag only helps an agent that is also added on its record.",
  ],
  'c-lone-name-word-must-name-category': ['It leaves the strong-prose misfiles where they are.'],
  'd-c-plus-anchored-everyday-terms': [
    'It leaves the lone-honeypot misfiles where they are, and its rebalancing condition drops rebalancers of stocks, vaults and DeFi protocols, as E does.',
  ],
  'e-d-plus-single-check': [
    "Its rebalancing condition asks the prose to name what is rebalanced from a list drawn from liquidity rebalancers, so it also drops rebalancers of other holdings: on the snapshot of 1 November, more of the agents it declined on a lone \"rebalancing\" were finance agents than metaphysics ones. F keeps them and still declines the metaphysics agents.",
  ],
};

/* ---------------------------------------------------------------------------
 * Markdown
 * ------------------------------------------------------------------------- */

const ROWS: Shown[] = ['health-factor', 'rebalancing', 'grid-trading', 'yield', 'token-safety', 'unclassified', NOT_LISTED];

function termList(terms: TermReport[]): string {
  if (terms.length === 0) return '—';
  return terms
    .map((t) => `\`${t.term}\` ${t.strength}${t.independent ? '' : ' (inside a strong term)'} [${t.fields.join(', ')}]`)
    .join('; ');
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

const VIA: Record<string, string> = { listing: 'listing', record: 'record' };
const shownWithVia = (shown: Shown, via: Placement['via']) => (via ? `${shown} (${VIA[via]})` : shown);

export function renderMarkdown(report: DryRunReport): string {
  const lines: string[] = [];
  const { input, checks } = report;
  lines.push('# Category dry run', '');
  lines.push(
    `Generated ${report.generatedAt} from \`${input.path}\` (snapshot taken ${input.takenAt ?? 'at an unknown time'}).`,
    `${input.listed} agents in the catalogue, and ${input.agents - input.listed} more that discovery reads returned but the catalogue does not list.`,
    '',
  );
  if (input.sources) lines.push(`Sources: ${Object.entries(input.sources).map(([k, v]) => `${k} \`${v}\``).join(', ')}.`, '');
  lines.push('Nothing here changes production. Every variant lives in `scripts/category-variants.mts`, which nothing under `src/` may import.', '');

  lines.push('## Checks', '');
  lines.push(
    `- Production's classifier, placed the way the catalogue is built, reproduces the live category of ${checks.liveReproduced.matched} of ${checks.liveReproduced.of} listed agents.` +
      (checks.liveReproduced.byRecord.length ? ` ${checks.liveReproduced.byRecord.length} of them are placed from their full record rather than a listing: ${checks.liveReproduced.byRecord.join('; ')}.` : ''),
  );
  if (checks.liveReproduced.unexplained.length) lines.push(`- Not reproduced: ${checks.liveReproduced.unexplained.join('; ')}.`);
  lines.push(`- The mirror scorer agrees with production's \`scoreCategories\` and \`classify\` on ${checks.mirrorParity.matched} of ${checks.mirrorParity.of} records (each agent with and without tags).` + (checks.mirrorParity.mismatches.length ? ` Disagrees on: ${checks.mirrorParity.mismatches.join('; ')}.` : ''));
  lines.push(`- ${checks.tagged} of ${input.listed} listed agents carry any tag in their registry record. Category listings classify list rows, which carry none, so tags decide only for agents added on their record.`);
  lines.push(
    `- ${checks.profileDisagrees.length} agents listed from their list row classify differently from their full record, so their profile page and their listing disagree today.` +
      (checks.profileDisagrees.length ? ' ' + checks.profileDisagrees.map((d) => `${d.name} (${d.key}): listed ${d.listing}, record ${d.profile}, tags [${d.tags.join(', ')}]`).join('; ') + '.' : ''),
  );
  lines.push(
    `- This snapshot's discovery reads returned ${checks.discovery.foundByOwnListing} of the ${checks.discovery.listRowAgents} agents listed from their list row for the category they are listed under; semantic search moves between calls. A listed agent is taken as found by its own category regardless, but an agent that moves to another category is only taken as found there if this snapshot's reads returned it for that category.`,
  );
  lines.push(`- The model would list ${checks.modelOverlists} agents outside the catalogue under production rules; the catalogue drops them by collapsing clones, capping listings per owner and filtering test identities, which the model does not repeat. Variants are compared with the model, not with the live figures, so this does not affect the changes below.`);
  if (checks.deadTerms.length) {
    lines.push(
      `- ${checks.deadTerms.length} terms can never match, because text is normalised (hyphens become spaces) and these terms are not: ${checks.deadTerms.map((d) => `\`${d.term}\` (${d.category}; ${d.agents} agents' text holds "${d.normalised}")`).join(', ')}. No variant here changes that; it belongs in its own change.`,
    );
  }
  lines.push('');

  lines.push('## Counts', '');
  lines.push('Listed agents by category. "not listed" counts agents in the catalogue today that a rule would remove from it.', '');
  lines.push(`| Category | Live | Production (model) | ${report.variants.map((v) => v.id.split('-')[0].toUpperCase()).join(' | ')} |`);
  lines.push(`|---|---:|---:|${report.variants.map(() => '---:').join('|')}|`);
  const base = report.variants[0]?.counts.before ?? emptyCounts();
  for (const id of ROWS) {
    lines.push(`| ${id} | ${report.liveCounts ? (report.liveCounts[id] ?? (id === NOT_LISTED ? '—' : 0)) : '—'} | ${base[id]} | ${report.variants.map((v) => `${v.counts.after[id]} (${signed(v.counts.after[id] - base[id])})`).join(' | ')} |`);
  }
  lines.push('');

  lines.push('## Leaving the catalogue', '');
  lines.push(
    'What "not listed" means for a buyer, as the catalogue is built today (read from `src/lib/marketplace.ts`, `src/features/discover/search.ts` and `src/lib/history/sweep.ts`; nothing here changes them):',
    '',
    "- Gone: every category listing, since each keeps only the rows its classifier places in that category (`readCategory`); and with them Discover's browsing, its category filters and counts, the home page, the leaderboard and rankings, `GET /api/v1/agents` and the assistant tool `search_agents`, which all read the same built catalogue (`listSearchableWithStatus`). Someone following the agent stops receiving updates, because follower alerts are drawn from that catalogue. The sitemap lists category listings only, so it already leaves out Unclassified agents with a signed price, and the scheduled category checks run only on category listings.",
    "- Kept: the profile page at `/agents/{chain}/{id}`, read from the registry and shown as Unclassified (`getDossier`). A search for its name still finds it, labelled as found by name rather than as a category match: Discover and `search_agents` ask the registry whenever nothing in the catalogue has exactly the name typed, and the API does when no listed name contains every word. Typing its ID finds it (`searchById`). Pokter keeps measuring it, because the sweep's roster includes every agent it already holds history for (`buildRoster`).",
    '',
    "Keeping these agents listed as Unclassified is not something the catalogue can do today: the only agents it lists without a category are those with a signed price (an agent Pokter enrolled is added only under a category). Keeping exactly the agents a rule change unclassifies would need a stored list of agents that were once misfiled. Keeping every agent discovery returns as Unclassified would also list the " +
      `${checks.unclassifiedDiscovered} agents this snapshot's discovery reads returned that production already leaves out as Unclassified (before clone collapse, the per-owner cap and the test-identity filter).`,
    '',
    'If every agent a rule takes out of the catalogue stayed in it as Unclassified instead:',
    '',
  );
  lines.push(`| Category | Production (model) | ${report.variants.map((v) => v.id.split('-')[0].toUpperCase()).join(' | ')} |`);
  lines.push(`|---|---:|${report.variants.map(() => '---:').join('|')}|`);
  for (const id of ROWS) {
    lines.push(`| ${id} | ${base[id]} | ${report.variants.map((v) => `${v.counts.ifKept[id]} (${signed(v.counts.ifKept[id] - base[id])})`).join(' | ')} |`);
  }
  lines.push('');

  lines.push('## Recommendation', '');
  lines.push(`**${report.variants.find((v) => v.id === report.recommendation.variant)?.label ?? report.recommendation.variant}**`, '');
  for (const reason of report.recommendation.reasons) lines.push(`- ${reason}`);
  lines.push('', 'Costs:', '');
  for (const cost of report.recommendation.costs) lines.push(`- ${cost}`);
  lines.push('', 'Against the others:', '');
  for (const line of report.recommendation.against) lines.push(`- ${line}`);
  lines.push('');

  for (const variant of report.variants) {
    const s = variant.summary;
    lines.push(`## ${variant.label}`, '', variant.rule, '');
    lines.push(
      `${s.changed} agents change: ${s.lostCategory} lose their category (${s.lostCategoryStillListed} stay listed as Unclassified on a signed price, ${s.lostCategoryLeaves} leave the catalogue), ${s.movedCategory} move category, ${s.gainedCategory} gain one.`,
      '',
    );
    if (variant.review) {
      const r = variant.review;
      lines.push(`Review set: ${reviewLine(variant)}` + (r.unfixed.length ? ` Not fixed: ${r.unfixed.join('; ')}.` : '') + (r.broken.length ? ` Broken: ${r.broken.join('; ')}.` : ''), '');
    }
    if (variant.changes.length) {
      lines.push('| Agent | ID | From → to | Terms behind current | Terms behind proposed | Signed price |');
      lines.push('|---|---|---|---|---|---|');
      for (const c of variant.changes) {
        const proposed = isCategory(c.to)
          ? `${c.toConfidence?.toFixed(2) ?? ''}: ${termList(c.toTerms)}`
          : c.declined
            ? `declined ${c.declined} on ${termList(c.toTerms)}`
            : `classified ${c.decided} at ${c.toConfidence?.toFixed(2) ?? ''}, but that listing's reads did not return it: ${termList(c.toTerms)}`;
        lines.push(`| ${cell(c.name)} | ${c.key} | ${shownWithVia(c.from, c.fromVia)} → ${shownWithVia(c.to, c.toVia)} | ${c.fromConfidence?.toFixed(2) ?? ''}: ${cell(termList(c.fromTerms))} | ${cell(proposed)} | ${c.signedPrice ? 'yes' : 'no'} |`);
      }
      lines.push('');
    }
    if (variant.reclassified.length) {
      const outside = variant.reclassified.filter((r) => !r.listed).length;
      lines.push(
        `Across all ${input.agents} agents read, in the catalogue or not, it reads ${variant.reclassified.length} list rows differently from production (${outside} of them not listed today):`,
        '',
      );
      for (const r of variant.reclassified) lines.push(`- ${r.name} (${r.key}, ${r.listed ? 'listed' : 'not listed'}): ${r.from} → ${r.to}`);
      lines.push('');
    }
    if (variant.wouldJoin.length) {
      lines.push('Outside the catalogue today, would join a category listing:', '');
      for (const j of variant.wouldJoin) lines.push(`- ${j.name} (${j.key}) → ${j.category}: ${termList(j.terms)}`);
      lines.push('');
    }
  }

  lines.push('## Reading the table', '');
  lines.push(
    '- `listing`: a category listing found the agent and classified its list row (no tags). `record`: added because it signed a price or Pokter enrolled it, and classified from its full record (tags included).',
    '- Term fields: `tag` is a publisher-declared tag; `name` and `description` are the registry text. Production scores the name twice, once as the name and once as prose.',
    '- Strong terms count 0.9 in a tag, 0.7 in the name and 0.6 in prose; weak terms 0.2, 0.35 and 0.15, each capped. The threshold is 0.3.',
    '- For an agent that loses its category, the proposed column shows the category the rule declined and the evidence it judged insufficient.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
