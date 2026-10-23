/**
 * One brief, several agents, one row each: what the comparison shows.
 *
 * Pure, so the rule for what a row says is tested without an agent on the
 * other end. A row states one of three things, never a blend of them: a
 * signed price that can be hired against, the inputs this agent needs that
 * the brief does not give, or why it would not quote. A price is shown only
 * when the agent signed it with its registered wallet over this exact brief.
 */
export interface CompareRow {
  chainId: number;
  tokenId: string;
  name: string;
  state: 'priced' | 'needs-input' | 'no-quote';
  price: { label: string; network: string; real: boolean; expiresAt: string | null } | null;
  /** Inputs the agent's skill needs that the brief does not state, as questions. */
  missing: Array<{ label: string; question: string }>;
  /** Why no price came back, in the buyer-facing words the hire page uses. */
  reason: string | null;
  /** Median time from funding to delivery on its past paid jobs, when there are any. */
  deliveryMs: number | null;
  hireUrl: string;
}

export function compareRow(input: {
  chainId: number;
  tokenId: string;
  name: string;
  task: string;
  quote: { label: string | null; network: { label: string; real: boolean } | null; expiresAt: string | null } | null;
  missing: Array<{ label: string; question: string }>;
  failure: string | null;
  deliveryMs: number | null;
}): CompareRow {
  const hireUrl = `/hire/${input.chainId}/${input.tokenId}?task=${encodeURIComponent(input.task)}`;
  const base = { chainId: input.chainId, tokenId: input.tokenId, name: input.name, deliveryMs: input.deliveryMs, hireUrl };
  if (input.quote?.label && input.quote.network) {
    return { ...base, state: 'priced', price: { label: input.quote.label, network: input.quote.network.label, real: input.quote.network.real, expiresAt: input.quote.expiresAt }, missing: input.missing, reason: null };
  }
  if (input.missing.length > 0) {
    return { ...base, state: 'needs-input', price: null, missing: input.missing, reason: input.failure };
  }
  return { ...base, state: 'no-quote', price: null, missing: [], reason: input.failure ?? 'It did not return a signed price for this brief.' };
}

/** Priced rows first, cheapest first among them; then rows that need an answer; then the rest, in the order asked. */
export function orderRows(rows: readonly CompareRow[], priceOf: (row: CompareRow) => number | null): CompareRow[] {
  const rank = (row: CompareRow) => (row.state === 'priced' ? 0 : row.state === 'needs-input' ? 1 : 2);
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row) - rank(b.row) || (rank(a.row) === 0 ? (priceOf(a.row) ?? Infinity) - (priceOf(b.row) ?? Infinity) : 0) || a.index - b.index)
    .map(({ row }) => row);
}

/**
 * Which agents a comparison asks: up to three that can be hired, in the
 * category the brief was read as when there is one, those with a signed
 * price first and otherwise in the order the results ranked them. Asking
 * the first three rows as listed sent a token-safety question to a sniper
 * bot and a rebalancing planner.
 */
export function comparisonCandidates<T extends { hirable: boolean; nameOnly?: boolean; category: string; priceU: number | null }>(rows: readonly T[], category: string | null, count = 3): T[] {
  return rows
    .filter((row) => row.hirable && !row.nameOnly && (!category || row.category === category))
    .map((row, index) => ({ row, index }))
    .sort((a, b) => Number(b.row.priceU !== null) - Number(a.row.priceU !== null) || a.index - b.index)
    .slice(0, count)
    .map(({ row }) => row);
}
