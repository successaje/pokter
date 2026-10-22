import { answerAccount, readHfAnswer } from '@/lib/assay/health-factor';
import { answerFromManifest } from '@/lib/assay/paid-grade';

/**
 * Checking a delivered Venus health-factor report against the chain, at the
 * block the report itself names.
 *
 * Pokter already had two ways of judging a health-factor answer and neither
 * does this job. The free pre-hire check (`assay/health-factor.ts`) reads
 * Venus just before and just after the agent replies, so the answer is
 * bracketed by two readings. The paid check (`assay/paid-hf-grade.ts`)
 * compares a delivery with a reading taken at grading time and sets aside
 * anything more than fifteen minutes apart, because a position moves. Both
 * are about the agent's record. Neither tells the buyer holding one report
 * whether the numbers in it are true.
 *
 * This one does, and it buys that by refusing to guess. The whole check is
 * bound to the block the report names:
 *
 *   - no block named, no check. "Verify at head" would compare a report
 *     written an hour ago with a position that has moved since, and the
 *     answer would be about the clock rather than about the report.
 *   - evidence read at any other block is refused outright, inside
 *     `verifyVenusReport`, rather than trusted to be read correctly by
 *     whatever called it.
 *   - no historical state available from the node, no check. Every free BNB
 *     Chain endpoint prunes state within about a hundred blocks ("missing
 *     trie node", "Archive requests require a personal token", measured on
 *     22 October), so this is the ordinary case and not an edge.
 *
 * Which leaves exactly three outcomes, and the only one that is ever earned
 * is `matches`:
 *
 *   `matches`     the figures agree with Venus's own accounting at that block
 *   `differs`     they do not, and we can say by how much
 *   `unverified`  we could not see, so we say nothing about the report
 *
 * Advisory only, and that is a design constraint rather than a disclaimer.
 * Nothing here releases escrow, refunds a buyer, settles a dispute, scores
 * an agent or touches a bond; the route that calls it is a GET. A buyer
 * reads it and decides. See `CHECK_MEANS` and `CHECK_DOES_NOT_MEAN` for
 * what a `matches` is and is not allowed to claim, which the interface
 * prints verbatim.
 *
 * Pure on purpose: the chain read is injected (`readFactsAt`), so every
 * branch below — including a dead RPC and a wrong-block evidence packet —
 * is reachable from a test without a network.
 */

/** The Venus pool Pokter can check, and the only one these verdicts cover. */
export const CHECKED_POOL = 'core';

/**
 * Where the position lives, which is not where the job was paid.
 *
 * Venus Core Pool is on BNB Smart Chain mainnet, and Pokter's health-factor
 * agents read it whichever escrow funded the hire — the testnet listing is
 * a free trial of the same answer, not a different service (see
 * `house/agents/brinkwatch.ts`). Deriving this from the job's escrow chain
 * would check a testnet-funded job against a chain that has no Venus Core
 * Pool on it and report "could not verify" forever.
 */
export const VENUS_CHAIN_ID = 56;

/**
 * How far a report's health factor may sit from Venus's own at the same
 * block, and why it is this and not the 2% the pre-hire check allows.
 *
 * That 2% pays for a position moving between two readings minutes apart.
 * Here there is nothing to pay for: at a named block every oracle price,
 * every supply balance, every borrow index and every exchange rate is one
 * fixed value, and two correct readings of it can only differ in how they
 * present the result. So the tolerance covers presentation and nothing
 * else.
 *
 *  - `HF_ABSOLUTE_TOLERANCE` 0.005. A health factor printed to two decimal
 *    places can be out by half of the last place through rounding alone,
 *    with no error at all in the reading. Brinkwatch prints four places;
 *    two is the coarsest this check treats as a precise claim.
 *  - `HF_RELATIVE_TOLERANCE` 0.005, i.e. 0.5%. Two decimal places stops
 *    being the binding constraint above a health factor of about 1, and
 *    the order of the divisions starts to matter: Venus's own arithmetic
 *    truncates at several points (1e18-scaled integer division per leg),
 *    and a report that sums USD legs in floating point and divides once
 *    can differ in the fourth significant figure. 0.5% covers that with
 *    room to spare and is still far too tight to hide the error this check
 *    exists to find — answering the borrowing-limit ratio on collateral
 *    factors instead of the liquidation-threshold one, which on a real
 *    Venus position is tens of percent out.
 *
 * The allowance is the larger of the two, so it never falls below 0.005 on
 * a position near liquidation and never becomes absurdly tight on a health
 * factor of 40.
 */
export const HF_ABSOLUTE_TOLERANCE = 0.005;
export const HF_RELATIVE_TOLERANCE = 0.005;

/**
 * The same, for the USD totals a report states alongside the ratio.
 *
 * Wider than the health factor deliberately. Pokter's own reading rounds
 * each leg to cents and drops anything below one (`assay/venus.ts`), and
 * reports round these to whole dollars; neither rounding affects the ratio,
 * because it divides two numbers that moved together. A dollar total is
 * corroboration, not the claim being checked, and holding it to 0.5% would
 * manufacture mismatches out of rounding that cannot change the answer.
 */
export const USD_ABSOLUTE_TOLERANCE = 1;
export const USD_RELATIVE_TOLERANCE = 0.01;

/**
 * The coarsest stated precision this check can tell apart from the truth.
 *
 * A report that says "health factor 1.0" has claimed something true of
 * anything from 0.95 to 1.05 — a band twenty times the tolerance above, and
 * wide enough to straddle liquidation. Calling that a mismatch would punish
 * an agent for rounding; calling it a match would let a report that states
 * one significant figure collect a verdict it never earned, and would make
 * "always answer 1.0" a passing strategy. It is neither: it is a report too
 * coarse to check, which is `unverified` with that said plainly.
 *
 * It only ever fires below two decimal places. At two or more, half of the
 * last place is already inside `HF_ABSOLUTE_TOLERANCE`.
 */
export const HF_MIN_STATED_DECIMALS = 2;

/** What a `matches` verdict is allowed to claim, printed verbatim in the UI. */
export const CHECK_MEANS = [
  'The figures named below were recomputed from Venus’s own contracts at the block the report names, and they agree within the stated tolerance.',
];

/**
 * And what it is not allowed to claim.
 *
 * Written here rather than in the component because it is the substance of
 * the feature, not decoration on it: a verifier that checks one ratio and
 * is read as certifying a report has done harm, not good.
 */
export const CHECK_DOES_NOT_MEAN = [
  'It does not certify the rest of the report. Advice, forecasts, prose and any figure not listed below were not checked.',
  'It does not say the position is safe, or that it still holds now. It describes one account at one past block.',
  'It is not a statement about investment performance, and not investment advice.',
  'It does not make the agent trustworthy in general, and it decides nothing about the money: Pokter does not release, refund or dispute escrow on the strength of it. That stays the buyer’s decision.',
];

export type ReportVerdict = 'matches' | 'differs' | 'unverified';

/** What the request named, which is what the report is held to. */
export interface VenusHealthSubject {
  chainId: number;
  account: string;
  /** `CHECKED_POOL`. Present so a caller cannot silently widen the scope. */
  pool: typeof CHECKED_POOL;
}

export interface VenusReportClaim {
  /** The account the report says it is about, when it names one. */
  account: string | null;
  /** The chain, when the report names one unambiguously. */
  chainId: number | null;
  /** Venus pools the report's own identifying fields name, deduped. */
  pools: string[];
  /** The block the report names. The check is bound to it. */
  block: bigint;
  /** Null when the report says there is no debt, so no health factor. */
  healthFactor: number | null;
  /** Decimal places the report wrote it to, or null when that cannot be read. */
  statedDecimals: number | null;
  liquidatable: boolean | null;
  /** The liquidation field as given, when it was present but not a yes or no. */
  liquidatableRaw: string | null;
  debtUsd: number | null;
  collateralUsd: number | null;
}

export type ClaimRefusalCode = 'unreadable' | 'no-health-factor' | 'no-block' | 'bad-block';

export type ClaimResult = { ok: true; claim: VenusReportClaim } | { ok: false; code: ClaimRefusalCode };

/** What Venus's contracts say about one account in one pool at one block. */
export interface VenusHealthFacts {
  chainId: number;
  account: string;
  pool: typeof CHECKED_POOL;
  block: bigint;
  /** The block's own timestamp, when the node gave one. */
  blockTime: string | null;
  /** On liquidation thresholds: what Venus liquidates on. Null with no debt. */
  healthFactor: number | null;
  /** The same ratio on collateral factors, to tell a definition apart from an error. */
  borrowLimitRatio: number | null;
  liquidatable: boolean;
  debtUsd: number;
  collateralUsd: number;
}

export type EvidenceRefusalCode = 'no-history' | 'read-failed' | 'block-ahead-of-head';

export type VenusEvidence =
  | { available: true; facts: VenusHealthFacts }
  | { available: false; code: EvidenceRefusalCode; detail: string };

export interface CheckedValue {
  label: string;
  /** What the report said, in a reader's terms. */
  reported: string;
  /** What Venus said at that block, in the same terms. */
  checked: string;
  /** True when they agree, false when they do not, null when not compared. */
  agrees: boolean | null;
  /** Why, when the plain comparison needs a sentence. */
  note?: string;
}

export interface VenusReportVerification {
  verdict: ReportVerdict;
  /** The one line a buyer reads first. */
  headline: string;
  /** Why, in the buyer's terms. Never raw JSON. */
  detail: string;
  /** The block everything below is bound to, when there is one. */
  block: string | null;
  blockTime: string | null;
  values: CheckedValue[];
  /** Where each checked number came from: contract, call, block. */
  evidence: string[];
  /** The calculation, in words a reader can repeat. */
  method: string[];
  /** The tolerances, numerically. */
  tolerance: string[];
  limitations: string[];
}

/* ---------- what was asked ---------- */

export type SubjectResult = { ok: true; subject: VenusHealthSubject } | { ok: false; code: 'none' | 'ambiguous'; candidates: string[] };

/**
 * The account to check, taken from the brief the buyer funded.
 *
 * Never from the report. A report that chose its own subject would be
 * marking its own paper: it could answer about any wallet, correctly, and
 * collect "Matches checked facts" for a position nobody asked about. The
 * brief is on chain in the job description, so this is the one fact in the
 * comparison that the agent cannot move.
 *
 * Two wallets in the brief is `ambiguous` rather than "the first one".
 * Picking would be choosing the subject on the buyer's behalf, and a brief
 * that names a wallet and a contract reads the same way to a regular
 * expression as one that names two wallets.
 */
export function venusSubjectFromBrief(brief: string): SubjectResult {
  const seen = new Map<string, string>();
  for (const match of brief.matchAll(/0x[0-9a-fA-F]{40}/g)) {
    seen.set(match[0].toLowerCase(), match[0]);
  }
  const found = [...seen.values()];
  if (found.length === 0) return { ok: false, code: 'none', candidates: [] };
  if (found.length > 1) return { ok: false, code: 'ambiguous', candidates: found };
  return { ok: true, subject: { chainId: VENUS_CHAIN_ID, account: found[0], pool: CHECKED_POOL } };
}

/* ---------- reading the report ---------- */

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const BLOCK_KEYS = ['block', 'block_number', 'blockNumber', 'blockheight', 'block_height', 'at_block'];

/** `as_of.block`, else a block named at the top level. Nested one level, no deeper. */
function findBlock(record: Record<string, unknown>): unknown {
  const asOf = object(record.as_of) ?? object(record.asOf);
  for (const key of BLOCK_KEYS) {
    if (asOf && asOf[key] !== undefined && asOf[key] !== null) return asOf[key];
  }
  for (const key of BLOCK_KEYS) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

/**
 * A block number, or null.
 *
 * Decimal strings, numbers and `0x`-prefixed hex are all in use. Anything
 * else — a date, "latest", a float, a negative — is not a block, and the
 * check must say so rather than coerce it: `Number('latest')` is NaN and
 * `BigInt(1.5)` throws, and both used to arrive at the comparison as a
 * block of zero in earlier drafts of this parser.
 */
function readBlock(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value > 0n ? value : null;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? BigInt(value) : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/[_,\s]/g, '');
  if (/^0x[0-9a-fA-F]{1,16}$/.test(text)) {
    const parsed = BigInt(text);
    return parsed > 0n ? parsed : null;
  }
  if (!/^\d{1,18}$/.test(text)) return null;
  const parsed = BigInt(text);
  return parsed > 0n ? parsed : null;
}

const USD_KEYS = {
  debt: ['debt_usd', 'debtUsd', 'total_debt_usd', 'borrow_usd', 'borrowUsd', 'total_borrows_usd'],
  collateral: ['collateral_usd', 'collateralUsd', 'total_collateral_usd', 'supply_usd', 'supplied_usd'],
};

function readUsd(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.replace(/[$,\s]/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * Venus's pools, matched the way Venus names them.
 *
 * A bare field value ("core", "Stablecoins") counts, and so does the name
 * qualified by "pool" anywhere in a longer sentence ("Venus Core Pool, BNB
 * Smart Chain mainnet"). An unqualified mention inside a sentence does not,
 * which is what keeps "Venus (DeFi lending) Core Pool" from reading as two
 * pools and resolving to `unverified` — "defi" is an ordinary word in this
 * domain and "DeFi pool" is the proper noun.
 */
const VENUS_POOLS: Array<{ id: string; label: string; words: string }> = [
  { id: 'core', label: 'Core Pool', words: 'core' },
  { id: 'stablecoins', label: 'Stablecoins pool', words: 'stablecoins?' },
  { id: 'defi', label: 'DeFi pool', words: 'defi' },
  { id: 'gamefi', label: 'GameFi pool', words: 'gamefi' },
  { id: 'liquid-staked-bnb', label: 'Liquid Staked BNB pool', words: 'liquid[\\s-]*staked[\\s-]*bnb' },
  { id: 'tron', label: 'Tron pool', words: 'tron' },
  { id: 'meme', label: 'Meme pool', words: 'meme' },
];

export function venusPoolLabel(id: string): string {
  return VENUS_POOLS.find((pool) => pool.id === id)?.label ?? id;
}

/** The fields in which a report says what it is about, rather than its whole prose. */
const POOL_FIELDS = ['pool', 'protocol', 'market', 'venue', 'platform', 'protocol_pool'];

function poolsNamedIn(record: Record<string, unknown>): string[] {
  const found = new Set<string>();
  for (const field of POOL_FIELDS) {
    const value = record[field];
    const text = typeof value === 'string' ? value : null;
    if (!text) continue;
    for (const pool of VENUS_POOLS) {
      const bare = new RegExp(`^\\s*(?:venus\\s+)?${pool.words}(?:\\s+(?:isolated\\s+)?pool)?\\s*$`, 'i');
      const qualified = new RegExp(`${pool.words}\\s+(?:isolated\\s+)?pool|pool[:\\s-]+(?:venus\\s+)?${pool.words}`, 'i');
      if (bare.test(text) || qualified.test(text)) found.add(pool.id);
    }
  }
  return [...found];
}

/**
 * The chain the report names, and only when it is not a guess.
 *
 * A numeric chain id, or a name that maps to one of the two BNB chains
 * without interpretation. Anything else stays null and the chain simply is
 * not one of the checked values — inferring a chain from prose and then
 * publishing "differs from checked facts" on the strength of it would be
 * the verifier inventing the disagreement.
 */
function readChainId(record: Record<string, unknown>): number | null {
  for (const key of ['chain_id', 'chainId']) {
    const value = record[key];
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
    if (typeof value === 'string' && /^\d{1,7}$/.test(value.trim())) return Number(value.trim());
  }
  for (const key of ['chain', 'network']) {
    const value = record[key];
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
    if (typeof value !== 'string') continue;
    if (/testnet|chapel/i.test(value)) return 97;
    if (/\b(?:bnb|bsc|binance)\b/i.test(value)) return 56;
  }
  return null;
}

/**
 * How many decimal places the report wrote the health factor to.
 *
 * Read from the served bytes, not from the parsed value, because the
 * distinction only exists in the text: `JSON.parse('1.0')` and
 * `JSON.parse('1')` are the same number, and the precision guard above
 * turns on exactly that difference. The manifest carries the report as a
 * JSON string, so the quotes come through escaped; both forms are matched.
 */
const HF_LITERAL = /\\?"(?:health_?factor|hf)\\?"\s*:\s*(-?\d+(?:\.\d+)?)/i;

export function statedHfDecimals(manifestText: string, value: number): number | null {
  const literal = manifestText.match(HF_LITERAL)?.[1];
  if (!literal) return null;
  // A literal somewhere else in the file is not this claim's precision.
  if (Math.abs(Number(literal) - value) > 1e-9) return null;
  return literal.includes('.') ? literal.split('.')[1].length : 0;
}

/**
 * What a delivered manifest claims about a Venus position.
 *
 * Reuses the readers Pokter already has — `answerFromManifest` for the
 * answer inside the ERC-8183 envelope, `readHfAnswer` for the health factor
 * and liquidation flag under any of the names agents use, `answerAccount`
 * for the subject — so that what this check reads and what the pre-hire
 * check reads are the same thing by construction. Only the block, the pool,
 * the chain and the USD totals are new, because only this check needs them.
 */
export function readVenusReportClaim(manifestText: string): ClaimResult {
  const answer = answerFromManifest(manifestText);
  if (!answer) return { ok: false, code: 'unreadable' };
  const record = answer.data ?? null;
  if (!record) {
    /*
     * Prose. The pre-hire check grades prose on its merits, because an
     * answer is still an answer. This one cannot: there is no block to bind
     * to in a sentence, and binding is the whole point.
     */
    return { ok: false, code: 'no-block' };
  }

  const observed = readHfAnswer(answer);
  if (!observed) return { ok: false, code: 'no-health-factor' };

  const rawBlock = findBlock(record);
  if (rawBlock === undefined) return { ok: false, code: 'no-block' };
  const block = readBlock(rawBlock);
  if (block === null) return { ok: false, code: 'bad-block' };

  const healthFactor = observed.unbounded ? null : observed.healthFactor;
  return {
    ok: true,
    claim: {
      account: answerAccount(answer),
      chainId: readChainId(record),
      pools: poolsNamedIn(record),
      block,
      healthFactor,
      statedDecimals: healthFactor === null ? null : statedHfDecimals(manifestText, healthFactor),
      liquidatable: observed.liquidatable,
      liquidatableRaw: observed.liquidatableRaw ?? null,
      debtUsd: readUsd(record, USD_KEYS.debt),
      collateralUsd: readUsd(record, USD_KEYS.collateral),
    },
  };
}

/* ---------- the verdict ---------- */

const num = (value: number, places = 4) => String(Number(value.toFixed(places)));
const usd = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const yesNo = (value: boolean) => (value ? 'yes' : 'no');

/** The allowance on a health factor of this size, as described above. */
export function hfTolerance(expected: number): number {
  return Math.max(HF_ABSOLUTE_TOLERANCE, HF_RELATIVE_TOLERANCE * Math.abs(expected));
}

function usdTolerance(expected: number): number {
  return Math.max(USD_ABSOLUTE_TOLERANCE, USD_RELATIVE_TOLERANCE * Math.abs(expected));
}

/** Half of the last decimal place a report wrote: the band its own rounding claims. */
function halfLastPlace(decimals: number): number {
  return 0.5 * 10 ** -decimals;
}

const METHOD = [
  'Venus’s own accounting is the authority, not a re-implementation of it. `getAccountLiquidity(account)` on the Core Pool Comptroller returns the account’s spare borrowing capacity or its shortfall in USD, already weighted by each market’s liquidation threshold and priced by Venus’s oracle.',
  'With D the debt in USD, summed over the markets the account is in (`getAccountSnapshot` × `getUnderlyingPrice`): weighted collateral W = D + liquidity − shortfall, and health factor = W / D.',
  'That is below 1 exactly when Venus reports a shortfall, which is the condition under which the position can be liquidated — so the liquidation flag is read from the shortfall rather than inferred from the ratio.',
  'Every call is made at the block the report names, read-only, with no transaction of any kind.',
];

function toleranceLines(expected: number | null): string[] {
  const lines = [
    `Health factor: the larger of ±${HF_ABSOLUTE_TOLERANCE} and ±${HF_RELATIVE_TOLERANCE * 100}%${expected === null ? '' : `, so ±${num(hfTolerance(expected))} here`}. At a named block there is no price movement to allow for, so this covers presentation only: half of the last of two decimal places, and the order of Venus’s integer divisions.`,
    `USD totals: the larger of ±$${USD_ABSOLUTE_TOLERANCE} and ±${USD_RELATIVE_TOLERANCE * 100}%. They corroborate the ratio rather than being it, and both sides round their legs.`,
    'Liquidation flag: no tolerance. Venus’s shortfall at a block is exact.',
  ];
  return lines;
}

const LIMITS_ALWAYS = [
  'Venus Core Pool only. An isolated-pool position is not included, and this check refuses a report that is about one.',
  'One block. A health factor moves with every oracle update, so this says nothing about the position now.',
  'Only the values listed are checked. Nothing else in the report is.',
];

function base(block: bigint | null, blockTime: string | null, expected: number | null): Omit<VenusReportVerification, 'verdict' | 'headline' | 'detail' | 'values'> {
  return {
    block: block === null ? null : block.toString(),
    blockTime,
    evidence: [],
    method: METHOD,
    tolerance: toleranceLines(expected),
    limitations: LIMITS_ALWAYS,
  };
}

function unverified(
  headline: string,
  detail: string,
  options: { block?: bigint | null; blockTime?: string | null; values?: CheckedValue[]; extraLimits?: string[] } = {},
): VenusReportVerification {
  const built = base(options.block ?? null, options.blockTime ?? null, null);
  return {
    ...built,
    verdict: 'unverified',
    headline,
    detail,
    values: options.values ?? [],
    limitations: [...(options.extraLimits ?? []), ...built.limitations],
  };
}

/**
 * "Could not verify", for the reasons that arise before a report is even
 * read — no wallet in the brief, two of them, a job that asked for
 * something else. Exported so every one of these reaches the buyer in the
 * same shape, with the same method, tolerances and limitations attached, as
 * a verdict that came from a comparison.
 */
export function cannotVerify(detail: string): VenusReportVerification {
  return unverified('Could not verify', detail);
}

/**
 * Whether this job asked for the thing this check can check.
 *
 * Read from the job description on chain — the Pokter envelope's category,
 * else the brief's own words — and never from the delivery, so an agent
 * cannot opt its report into or out of being checked. Offering the panel on
 * a grid-trading job would only ever print "could not verify", which reads
 * as a failed check rather than as a check that does not apply.
 */
export function venusHealthJob(input: { category?: string | null; brief: string }): boolean {
  if (input.category === 'health-factor') return true;
  return /venus/i.test(input.brief) && /health[\s_-]*factor|liquidat/i.test(input.brief);
}

const CLAIM_REFUSALS: Record<ClaimRefusalCode, { headline: string; detail: string }> = {
  unreadable: {
    headline: 'Could not verify',
    detail: 'The delivered file could not be read as a report, so there is nothing in it to check against the chain.',
  },
  'no-health-factor': {
    headline: 'Could not verify',
    detail: 'The report states no health factor for this account, so there is no figure to recompute.',
  },
  'no-block': {
    headline: 'Could not verify',
    detail:
      'The report does not say which block it read. Without that, a check could only compare it with the position now — and a position moves, so the result would describe the delay rather than the report. An unstated block is not treated as “the latest”.',
  },
  'bad-block': {
    headline: 'Could not verify',
    detail: 'The report names a block, but not as a block number this check can read, so it cannot be pinned to one point on the chain.',
  },
};

const EVIDENCE_REFUSALS: Record<EvidenceRefusalCode, (detail: string, block: bigint) => string> = {
  'no-history': (detail, block) =>
    `BNB Chain state at block ${block} is no longer served by the node Pokter reads: ${detail} Free endpoints keep only the most recent blocks, so a report checked long after it was written usually cannot be checked at all. Pokter will not substitute a reading at a different block.`,
  'read-failed': (detail, block) => `Venus could not be read at block ${block}: ${detail} This is Pokter’s failure to see, and says nothing about the report.`,
  'block-ahead-of-head': (detail, block) => `The report names block ${block}, which the chain has not reached: ${detail} There is no state to read there.`,
};

/** What `verifyVenusReport` needs before it is given anything from the chain. */
interface PreEvidenceInput {
  subject: VenusHealthSubject;
  /** Null when nothing has been delivered. */
  manifestText: string | null;
  /**
   * Whether the bytes read hash to what the agent committed on chain.
   * Anything but `true` stops the check: a file that does not match its
   * commitment is not evidence, and neither is one whose commitment Pokter
   * could not read.
   */
  manifestMatchesChain: boolean | null;
  claim: ClaimResult | null;
}

/**
 * The verdict that can be reached without reading the chain at all, or null
 * when the chain has to be read.
 *
 * Split out so that `checkDeliveredVenusReport` can ask the question before
 * it fetches anything. A report about another wallet, or about an isolated
 * pool, or whose bytes do not match what was committed, is already decided;
 * reading Venus for it would be an archive request Pokter does not need,
 * made on behalf of a comparison that will never happen.
 */
export function preEvidenceVerdict(input: PreEvidenceInput): VenusReportVerification | null {
  const { subject } = input;

  if (input.manifestText === null) {
    return unverified('Could not verify', 'Nothing has been delivered for this job yet, so there is no report to check.');
  }
  if (input.manifestMatchesChain !== true) {
    return unverified(
      'Could not verify',
      input.manifestMatchesChain === false
        ? 'The file served does not hash to the deliverable the agent committed on chain, so it is not evidence of what was delivered. Until the two agree, checking its figures would be checking the wrong document.'
        : 'Pokter could not confirm that the file it read is the one the agent committed on chain, so it is not treated as evidence of what was delivered.',
    );
  }
  if (!input.claim) {
    return unverified('Could not verify', 'The report has not been read yet.');
  }
  if (!input.claim.ok) {
    const refusal = CLAIM_REFUSALS[input.claim.code];
    return unverified(refusal.headline, refusal.detail);
  }

  const claim = input.claim.claim;

  /*
   * The subject first, before any number.
   *
   * A report about another wallet or another chain is not a near miss on
   * the health factor — it is an answer to a different question, and its
   * figures can be perfectly correct about something nobody asked for.
   * Checking the ratio first and the subject second is how a report on the
   * agent's own provider wallet once came within tolerance of a pass
   * (job 97:1517, recorded in assay/paid-hf-grade.ts).
   */
  if (claim.account && claim.account.toLowerCase() !== subject.account.toLowerCase()) {
    const built = base(claim.block, null, null);
    return {
      ...built,
      verdict: 'differs',
      headline: 'Differs from checked facts',
      detail: `The report is about ${claim.account}, not the account this job asked about (${subject.account}). Whatever its figures say, they are not about this position.`,
      values: [{ label: 'Account', reported: claim.account, checked: subject.account, agrees: false }],
    };
  }
  if (claim.chainId !== null && claim.chainId !== subject.chainId) {
    const built = base(claim.block, null, null);
    return {
      ...built,
      verdict: 'differs',
      headline: 'Differs from checked facts',
      detail: `The report says it read chain ${claim.chainId}; this job asked about chain ${subject.chainId}. A health factor on one chain is not a fact about the other.`,
      values: [{ label: 'Chain', reported: String(claim.chainId), checked: String(subject.chainId), agrees: false }],
    };
  }

  /*
   * An ambiguous market is `unverified`, not `differs`. Venus runs isolated
   * pools alongside the Core Pool, each with its own Comptroller and its
   * own account liquidity; a single health factor across two of them is not
   * a defined quantity, and `getAccountLiquidity` on Core knows nothing
   * about the others. So a report naming more than one pool, or naming one
   * Pokter does not read, is a report this check cannot speak to — which is
   * different from a report that is wrong.
   */
  if (claim.pools.length > 1) {
    return unverified(
      'Could not verify',
      `The report names more than one Venus pool (${claim.pools.map(venusPoolLabel).join(', ')}). Each pool has its own Comptroller and its own account liquidity, so there is no single health factor spanning them, and Pokter cannot tell which one these figures belong to.`,
      { block: claim.block },
    );
  }
  if (claim.pools.length === 1 && claim.pools[0] !== subject.pool) {
    return unverified(
      'Could not verify',
      `The report is about Venus’s ${venusPoolLabel(claim.pools[0])}. Pokter checks the Core Pool only, so it has no figures of its own to compare these with.`,
      { block: claim.block },
    );
  }

  return null;
}

/**
 * Judge a claim against evidence read for it.
 *
 * Pure and synchronous, and it re-checks the binding it was given rather
 * than trusting it. Evidence for another block, another account or another
 * chain cannot produce a verdict here even if a caller hands it over as
 * though it belonged: the defect that guards against is a verifier that
 * reads the head, or the wrong wallet, and reports agreement — which is
 * worse than no verifier, because it is believed.
 */
export function verifyVenusReport(input: PreEvidenceInput & { evidence: VenusEvidence | null }): VenusReportVerification {
  const settled = preEvidenceVerdict(input);
  if (settled) return settled;

  // `preEvidenceVerdict` returns null only once the claim has parsed.
  const claim = (input.claim as { ok: true; claim: VenusReportClaim }).claim;
  const { subject } = input;
  const values: CheckedValue[] = [];

  if (!input.evidence) {
    return unverified('Could not verify', 'Pokter has not read the chain at that block yet.', { block: claim.block });
  }
  if (!input.evidence.available) {
    return unverified('Could not verify', EVIDENCE_REFUSALS[input.evidence.code](input.evidence.detail, claim.block), { block: claim.block });
  }

  const facts = input.evidence.facts;

  /*
   * The binding, re-checked here rather than assumed.
   *
   * Evidence is read by a caller, and a caller can be wrong: read the head
   * because the historical read failed, read a cached packet for a
   * different wallet, read the testnet. Each of those would produce a
   * confident verdict about a comparison that never happened. None of them
   * can pass this.
   */
  if (facts.block !== claim.block || facts.account.toLowerCase() !== subject.account.toLowerCase() || facts.chainId !== subject.chainId || facts.pool !== subject.pool) {
    return unverified(
      'Could not verify',
      `Pokter’s reading does not belong to this claim — it is of ${facts.account} on chain ${facts.chainId} at block ${facts.block}, and the report claims ${subject.account} on chain ${subject.chainId} at block ${claim.block}. A reading taken anywhere else is not evidence about this report, so no verdict is given.`,
      { block: claim.block },
    );
  }

  const built = base(claim.block, facts.blockTime, facts.healthFactor);
  const evidence = [
    `Venus Core Pool Comptroller · getAccountLiquidity(${subject.account}) at block ${claim.block}`,
    `Venus vTokens · getAccountSnapshot and oracle getUnderlyingPrice at block ${claim.block}`,
    facts.blockTime ? `Block ${claim.block} was mined at ${facts.blockTime}` : `Block ${claim.block}`,
  ];
  const limitations = [...built.limitations];
  if (claim.pools.length === 0) {
    limitations.unshift('The report does not name which Venus pool it read. It has been checked against the Core Pool, which is what the job asked for.');
  }

  const differs = (detail: string): VenusReportVerification => ({ ...built, evidence, limitations, verdict: 'differs', headline: 'Differs from checked facts', detail, values });

  /* No debt is a real state, and it has its own failure modes. */
  if (facts.healthFactor === null) {
    values.push({
      label: 'Health factor',
      reported: claim.healthFactor === null ? 'none — no debt' : num(claim.healthFactor),
      checked: 'none — no debt',
      agrees: claim.healthFactor === null,
      note: 'Venus reports no borrow for this account at this block, so there is no ratio to state.',
    });
    if (claim.healthFactor !== null) {
      return differs(`The report gives a health factor of ${num(claim.healthFactor)}, but Venus shows no debt for this account at block ${claim.block}, so there is no health factor to give.`);
    }
    if (claim.liquidatable === true) {
      values.push({ label: 'Liquidatable', reported: 'yes', checked: 'no', agrees: false });
      return differs(`The report says the position can be liquidated. With no debt at block ${claim.block} there is nothing to liquidate.`);
    }
    values.push({ label: 'Liquidatable', reported: claim.liquidatable === null ? 'not stated' : 'no', checked: 'no', agrees: claim.liquidatable === null ? null : true });
    return {
      ...built,
      evidence,
      limitations,
      verdict: 'matches',
      headline: 'Matches checked facts',
      detail: `Venus shows no borrow for this account at block ${claim.block}, which is what the report says.`,
      values,
    };
  }

  if (claim.healthFactor === null) {
    values.push({ label: 'Health factor', reported: 'none — no debt', checked: num(facts.healthFactor), agrees: false });
    return differs(`The report says this account has no debt. At block ${claim.block} Venus puts its health factor at ${num(facts.healthFactor)} on ${usd(facts.debtUsd)} of debt.`);
  }

  const allowance = hfTolerance(facts.healthFactor);
  const gap = Math.abs(claim.healthFactor - facts.healthFactor);
  const agrees = gap <= allowance;
  values.push({
    label: 'Health factor',
    reported: num(claim.healthFactor),
    checked: num(facts.healthFactor),
    agrees,
    note: agrees ? `Within the ±${num(allowance)} allowed for rounding.` : `Out by ${num(gap)}, where ±${num(allowance)} is allowed.`,
  });

  if (!agrees) {
    /*
     * The precision guard, before the mismatch is published.
     *
     * A report that wrote one significant figure has not claimed the
     * precision this comparison assumes, and calling it wrong would be
     * holding it to a number it never gave.
     */
    if (claim.statedDecimals !== null && claim.statedDecimals < HF_MIN_STATED_DECIMALS && gap <= halfLastPlace(claim.statedDecimals)) {
      values[values.length - 1] = { ...values[values.length - 1], agrees: null, note: `Stated to ${claim.statedDecimals} decimal place${claim.statedDecimals === 1 ? '' : 's'}, a band of ±${num(halfLastPlace(claim.statedDecimals))}.` };
      return unverified(
        'Could not verify',
        `The report states the health factor as ${num(claim.healthFactor)}, to ${claim.statedDecimals} decimal place${claim.statedDecimals === 1 ? '' : 's'}. Venus puts it at ${num(facts.healthFactor)}. Rounded that coarsely the two cannot be told apart — the report’s own figure covers anything within ±${num(halfLastPlace(claim.statedDecimals))} — so this is neither a match nor a disagreement the report earned.`,
        { block: claim.block, blockTime: facts.blockTime, values },
      );
    }
    /*
     * The one error worth naming. Venus's collateral factor and its
     * liquidation threshold differ per market (FDUSD: 0.65 against 0.75),
     * so the borrowing-limit ratio and the health factor are different
     * numbers, and reporting the first as the second is a definitional
     * mistake rather than a reading error.
     */
    if (facts.borrowLimitRatio !== null && Math.abs(claim.healthFactor - facts.borrowLimitRatio) <= hfTolerance(facts.borrowLimitRatio)) {
      return differs(
        `The report gives ${num(claim.healthFactor)}, which is this position’s borrowing-limit ratio on Venus’s collateral factors at block ${claim.block}, not its health factor. Venus liquidates on liquidation thresholds, which put the health factor at ${num(facts.healthFactor)}. The two differ wherever a market’s threshold exceeds its collateral factor.`,
      );
    }
    return differs(
      `The report gives a health factor of ${num(claim.healthFactor)}. Recomputed from Venus’s own contracts at block ${claim.block} it is ${num(facts.healthFactor)} — out by ${num(gap)}, where ±${num(allowance)} is allowed for rounding.`,
    );
  }

  /*
   * A liquidation field that is present but not a yes or no ("maybe", 1, an
   * object) is not the same as an unstated one. The report made a claim and
   * Pokter cannot read it, so the report cannot be called a match — a
   * verdict of "matches" would be asserting agreement on a field nobody
   * compared.
   */
  if (claim.liquidatableRaw !== null) {
    values.push({ label: 'Liquidatable', reported: claim.liquidatableRaw, checked: yesNo(facts.liquidatable), agrees: null, note: 'Not a yes or no, so it could not be compared.' });
    return unverified(
      'Could not verify',
      `The health factor agrees with Venus at block ${claim.block}, but the report’s liquidation field is ${claim.liquidatableRaw} rather than a yes or no, so that half of the answer cannot be checked.`,
      { block: claim.block, blockTime: facts.blockTime, values },
    );
  }
  if (claim.liquidatable !== null && claim.liquidatable !== facts.liquidatable) {
    values.push({ label: 'Liquidatable', reported: yesNo(claim.liquidatable), checked: yesNo(facts.liquidatable), agrees: false, note: 'Read from Venus’s shortfall at this block, which is exact.' });
    return differs(
      `The health factor is right, but the report says the position ${claim.liquidatable ? 'can' : 'cannot'} be liquidated and Venus says it ${facts.liquidatable ? 'can' : 'cannot'} at block ${claim.block}.`,
    );
  }
  values.push({
    label: 'Liquidatable',
    reported: claim.liquidatable === null ? 'not stated' : yesNo(claim.liquidatable),
    checked: yesNo(facts.liquidatable),
    agrees: claim.liquidatable === null ? null : true,
    note: claim.liquidatable === null ? 'The report does not say, so this was not compared.' : undefined,
  });

  /*
   * The USD totals are checked when stated and ignored when not. A
   * disagreement here is reported as a disagreement — these are claims
   * about the same block — but they are listed after the ratio because the
   * ratio is what the buyer acts on.
   */
  const usdRows: CheckedValue[] = [];
  for (const [label, reported, checked] of [
    ['Debt', claim.debtUsd, facts.debtUsd],
    ['Collateral', claim.collateralUsd, facts.collateralUsd],
  ] as const) {
    if (reported === null) {
      usdRows.push({ label: `${label} (USD)`, reported: 'not stated', checked: usd(checked), agrees: null, note: 'The report does not give this, so it was not compared.' });
      continue;
    }
    const room = usdTolerance(checked);
    const off = Math.abs(reported - checked);
    usdRows.push({
      label: `${label} (USD)`,
      reported: usd(reported),
      checked: usd(checked),
      agrees: off <= room,
      note: off <= room ? undefined : `Out by ${usd(off)}, where ±${usd(room)} is allowed.`,
    });
  }
  values.push(...usdRows);
  // Only the dollar rows are consulted here: the ratio and the flag have
  // already been judged, and sweeping every row would re-report them.
  const usdRow = usdRows.find((row) => row.agrees === false);
  if (usdRow) {
    return differs(`The health factor agrees, but the report’s ${usdRow.label.toLowerCase()} figure does not: it gives ${usdRow.reported} where Venus shows ${usdRow.checked} at block ${claim.block}.`);
  }

  return {
    ...built,
    evidence,
    limitations,
    verdict: 'matches',
    headline: 'Matches checked facts',
    detail: `Recomputed from Venus’s own contracts at block ${claim.block}, this account’s health factor is ${num(facts.healthFactor)}; the report gives ${num(claim.healthFactor)}, inside the ±${num(allowance)} allowed for rounding.`,
    values,
  };
}

/**
 * The whole check: read the report, read the chain at the block it names,
 * judge.
 *
 * The reader is injected and is only ever called with the block the report
 * named, so there is no path through this function that reads the head and
 * compares against it.
 */
export async function checkDeliveredVenusReport(input: {
  subject: VenusHealthSubject;
  manifestText: string | null;
  manifestMatchesChain: boolean | null;
  readFactsAt: (at: { account: string; block: bigint }) => Promise<VenusEvidence>;
}): Promise<VenusReportVerification> {
  const claim = input.manifestText === null ? null : readVenusReportClaim(input.manifestText);
  const settled = preEvidenceVerdict({ ...input, claim });
  if (settled) return settled;
  // Non-null once `preEvidenceVerdict` has declined to settle it.
  const block = (claim as { ok: true; claim: VenusReportClaim }).claim.block;
  const evidence = await input.readFactsAt({ account: input.subject.account, block });
  return verifyVenusReport({ ...input, claim, evidence });
}
