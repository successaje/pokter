import type { Category } from '@/lib/agents/categories';
import type { Verdict } from '@/lib/proof/engine';

/**
 * A small query language for filtering agents.
 *
 * Borrowed in shape from GitHub-style search — `is:`, `has:`, `tag:` alongside
 * free text — because it lets one input serve both a casual reader and someone
 * who knows exactly what they want, and it stays shareable as a URL.
 *
 * Where it differs from the marketplaces that inspired it: the qualifiers
 * separate what an agent *claims* from what has been *observed* about it.
 * `tag:` matches publisher-declared metadata; `is:proven` and `has:probes>10`
 * match measurements. Collapsing those into one notion of "verified" is what
 * makes a directory unable to answer the only question that matters here.
 */

export type Qualifier =
  | { kind: 'text'; value: string }
  | { kind: 'is'; value: string }
  | { kind: 'tag'; value: string }
  | { kind: 'has'; field: string; op: '>' | '<' | '>=' | '<=' | '='; value: number }
  | { kind: 'has-flag'; field: string };

export interface ParsedQuery {
  qualifiers: Qualifier[];
  /** Terms that were not understood, so the UI can say so rather than ignore them. */
  unknown: string[];
}

/** Evidence states usable as `is:` values. */
const VERDICTS: Verdict[] = ['proven', 'emerging', 'unproven', 'failing'];

/** Non-verdict `is:` flags. */
const IS_FLAGS = ['live', 'offline', 'measured', 'unmeasured', 'testnet', 'mainnet'];

/** Numeric fields usable with `has:`. */
const HAS_FIELDS = ['attestations', 'probes', 'measurers', 'score', 'days'];

/** Fields usable as a bare `has:` presence check. */
const HAS_FLAGS = ['endpoint', 'description', 'attestations', 'record'];

const CATEGORY_ALIASES: Record<string, Category> = {
  rebalancing: 'rebalancing',
  rebalance: 'rebalancing',
  grid: 'grid-trading',
  'grid-trading': 'grid-trading',
  yield: 'yield',
  health: 'health-factor',
  'health-factor': 'health-factor',
};

export function categoryFromTag(tag: string): Category | null {
  return CATEGORY_ALIASES[tag.toLowerCase()] ?? null;
}

/** Everything the UI can suggest, so the dropdowns and parser cannot drift apart. */
export const VOCABULARY = {
  is: [...VERDICTS, ...IS_FLAGS],
  has: HAS_FIELDS,
  hasFlags: HAS_FLAGS,
  tags: Object.keys(CATEGORY_ALIASES),
};

const COMPARISON = /^(\w+)(>=|<=|>|<|=)(\d+(?:\.\d+)?)$/;

export function parseQuery(raw: string): ParsedQuery {
  const qualifiers: Qualifier[] = [];
  const unknown: string[] = [];

  // Quoted phrases survive as single text terms.
  const tokens = raw.match(/"[^"]*"|\S+/g) ?? [];

  for (const token of tokens) {
    const [prefix, ...rest] = token.split(':');
    const value = rest.join(':');

    if (!value) {
      const text = token.replace(/^"|"$/g, '').trim();
      if (text) qualifiers.push({ kind: 'text', value: text.toLowerCase() });
      continue;
    }

    const lower = value.toLowerCase();

    if (prefix === 'is') {
      if (VOCABULARY.is.includes(lower)) qualifiers.push({ kind: 'is', value: lower });
      else unknown.push(token);
      continue;
    }

    if (prefix === 'tag') {
      if (categoryFromTag(lower)) qualifiers.push({ kind: 'tag', value: lower });
      else unknown.push(token);
      continue;
    }

    if (prefix === 'has') {
      const comparison = COMPARISON.exec(lower);
      if (comparison) {
        const [, field, op, number] = comparison;
        if (HAS_FIELDS.includes(field)) {
          qualifiers.push({
            kind: 'has',
            field,
            op: op as '>' | '<' | '>=' | '<=' | '=',
            value: Number(number),
          });
          continue;
        }
      }
      if (HAS_FLAGS.includes(lower)) {
        qualifiers.push({ kind: 'has-flag', field: lower });
        continue;
      }
      unknown.push(token);
      continue;
    }

    unknown.push(token);
  }

  return { qualifiers, unknown };
}

/** Render qualifiers back to a query string, for chips that remove themselves. */
export function stringifyQuery(qualifiers: Qualifier[]): string {
  return qualifiers
    .map((q) => {
      switch (q.kind) {
        case 'text':
          return q.value.includes(' ') ? `"${q.value}"` : q.value;
        case 'is':
          return `is:${q.value}`;
        case 'tag':
          return `tag:${q.value}`;
        case 'has':
          return `has:${q.field}${q.op}${q.value}`;
        case 'has-flag':
          return `has:${q.field}`;
      }
    })
    .join(' ');
}

/** Human-readable label for a chip. */
export function describeQualifier(q: Qualifier): string {
  switch (q.kind) {
    case 'text':
      return `"${q.value}"`;
    case 'is':
      return `is ${q.value}`;
    case 'tag':
      return `${q.value}`;
    case 'has':
      return `${q.field} ${q.op} ${q.value}`;
    case 'has-flag':
      return `has ${q.field}`;
  }
}
