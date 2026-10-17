/**
 * Whether an agent's on-chain reviews look coordinated.
 *
 * ERC-8004 feedback costs only gas to write, so a handful of fresh wallets
 * can make an agent look reviewed. This reads patterns that independent
 * reviewers rarely produce, and says which it saw:
 *
 * - several wallets reviewing within the same hour;
 * - reviewers first funded by the same wallet, or by the agent's own owner
 *   or agent wallet (only when funders have been looked up: see
 *   `refreshFunders`, which needs a NodeReal key).
 *
 * One wallet writing most of the reviews is reported, but not as
 * coordination: on BNB Chain today that is usually a scoring service
 * posting a measurement per agent, or one buyer leaving feedback after
 * each job. It tells a reader the reviews are not from a broad base, which
 * is worth saying and not worth an accusation.
 *
 * It is a signal, worded as one ("look coordinated"), never a finding of
 * fraud, and it says "not enough to tell" below two reviews with known
 * authors rather than "looks fine".
 */
export type CoordinationLevel = 'unknown' | 'none' | 'watch' | 'coordinated';

export interface ReviewForCoordination {
  authorAddress: string | null;
  independence: 'independent' | 'related' | 'undetermined';
  createdAt: string | null;
}

export interface Coordination {
  level: CoordinationLevel;
  reasons: string[];
  /** Reviews whose author is known, of all reviews. */
  known: number;
  total: number;
  /** Whether funders were available to check at all. */
  fundersChecked: boolean;
  /** When one wallet wrote most of the independent reviews: how many, of how many. */
  oneReviewer: { count: number; of: number } | null;
}

const HOUR = 60 * 60_000;

export function reviewCoordination(
  reviews: readonly ReviewForCoordination[],
  options: { funders?: ReadonlyMap<string, string | null>; owner?: string | null; agentWallet?: string | null } = {},
): Coordination {
  const total = reviews.length;
  const known = reviews.filter((r) => r.authorAddress);
  const independent = known.filter((r) => r.independence === 'independent');
  const funders = options.funders ?? new Map<string, string | null>();
  const authors = [...new Set(independent.map((r) => r.authorAddress!.toLowerCase()))];
  const fundersChecked = authors.some((a) => funders.has(a));
  const byAuthor = new Map<string, number>();
  for (const r of independent) byAuthor.set(r.authorAddress!.toLowerCase(), (byAuthor.get(r.authorAddress!.toLowerCase()) ?? 0) + 1);
  const most = Math.max(0, ...byAuthor.values());
  const oneReviewer = most >= 3 && most / independent.length >= 0.5 ? { count: most, of: independent.length } : null;
  const base = { known: known.length, total, fundersChecked, oneReviewer };
  if (known.length < 2) return { level: 'unknown', reasons: [], ...base };

  const reasons: string[] = [];
  let level: CoordinationLevel = 'none';
  const raise = (to: CoordinationLevel) => {
    if (to === 'coordinated' || (to === 'watch' && level === 'none')) level = to;
  };

  // Several different wallets within one hour.
  const timed = independent
    .filter((r) => r.createdAt && Number.isFinite(Date.parse(r.createdAt)))
    .map((r) => ({ at: Date.parse(r.createdAt!), author: r.authorAddress!.toLowerCase() }))
    .sort((a, b) => a.at - b.at);
  let burst = 0;
  for (let i = 0; i < timed.length; i += 1) {
    const inHour = new Set(timed.filter((t) => t.at >= timed[i].at && t.at - timed[i].at <= HOUR).map((t) => t.author));
    burst = Math.max(burst, inHour.size);
  }
  if (burst >= 3) {
    reasons.push(`${burst} different wallets reviewed it within one hour`);
    raise(burst >= 5 ? 'coordinated' : 'watch');
  }

  // Shared funders, when known.
  const insiders = new Set([options.owner, options.agentWallet].filter((a): a is string => Boolean(a)).map((a) => a.toLowerCase()));
  const byFunder = new Map<string, string[]>();
  let fundedByInsider = 0;
  for (const author of authors) {
    const funder = funders.get(author);
    if (!funder) continue;
    if (insiders.has(funder.toLowerCase())) fundedByInsider += 1;
    byFunder.set(funder.toLowerCase(), [...(byFunder.get(funder.toLowerCase()) ?? []), author]);
  }
  if (fundedByInsider > 0) {
    reasons.push(`${fundedByInsider} reviewer${fundedByInsider === 1 ? ' was' : 's were'} first funded by the agent's owner or agent wallet`);
    raise('coordinated');
  }
  const shared = Math.max(0, ...[...byFunder.values()].map((group) => group.length));
  if (shared >= 2) {
    reasons.push(`${shared} reviewers were first funded by the same wallet`);
    raise(shared >= 3 ? 'coordinated' : 'watch');
  }

  return { level, reasons, ...base };
}

/** The Compare and profile wording. */
export function coordinationText(c: Coordination): string {
  if (c.total === 0) return 'No on-chain reviews';
  if (c.level === 'unknown') return 'Too few reviews with a known author to tell';
  const base = c.oneReviewer
    ? `${c.oneReviewer.count === c.oneReviewer.of ? `All ${c.oneReviewer.of}` : `${c.oneReviewer.count} of ${c.oneReviewer.of}`} independent reviews are from one reviewer. `
    : '';
  if (c.level === 'none') return `${base}${c.fundersChecked ? 'No sign of coordination, funders included' : 'No sign of coordination (funders not checked)'}`;
  return `${base}${c.level === 'coordinated' ? 'Reviews look coordinated' : 'Worth a look'}: ${c.reasons.join('; ')}`;
}
