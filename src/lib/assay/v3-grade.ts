import type { V3Position, V3Reading } from './pancakeswap-v3';
import { answerFromManifest } from './paid-grade';
import type { AssayScenarioResult } from './types';

/**
 * Grading a paid position-range check.
 *
 * One hire asks about one wallet and comes back with every position in it,
 * so a single job produces a row per position rather than one row per job.
 * Each row compares one fact: does the agent agree with Pokter about
 * whether that position earns at the current price.
 *
 * That fact is chosen because it is the one a reader can check and the one
 * the service exists to answer. The money in a position, its uncollected
 * fees and the re-centre plan all follow from arithmetic the agent and
 * Pokter would perform identically, so agreeing on them would prove only
 * that the same formula ran twice. Whether a position is in range comes
 * from three integers the protocol stores, and Pokter reads them itself.
 */

export type RangeStatus = 'in-range' | 'out-of-range' | 'closed';

/**
 * How far apart the delivery and Pokter's reading may be and still be
 * compared, in blocks.
 *
 * Two thousand blocks is about fifteen minutes: BSC blocks were measured
 * at 0.450 seconds apiece over a ten-thousand-block span on 16 October.
 * Blocks rather than wall-clock because both sides report the block they
 * read, and that is the state they actually saw.
 *
 * Stricter than the health factor rule in one way that matters. There, a
 * stale answer that still matches Venus to within 2% passes, because
 * hitting a specific decimal by chance is unlikely. Here the answer is one
 * of three words, and most positions are in range, so a stale agreement is
 * weak evidence — it could as easily be the price having moved back. So a
 * delivery too old to compare is set aside whether it agrees or not: not a
 * pass it has not earned, and not a failure either.
 *
 * The case that prompted this was real. Job 1484 was graded 38,475 blocks
 * — 4.8 hours — after Centreline read the pool. It agreed, and the tick
 * width matched the price range it reported, so the answer was sound; but
 * nothing in the grading established that, and a position sitting near a
 * bound could have crossed it in between.
 */
export const V3_COMPARABLE_BLOCKS = 2_000;

/** The block the answer says it read, from its own `as_of`. */
export function answerReadBlock(manifestText: string): number | null {
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return null;
  }
  const response = typeof manifest === 'object' && manifest !== null ? (manifest as Record<string, unknown>).response : null;
  const raw = typeof response === 'object' && response !== null ? (response as Record<string, unknown>).content : null;
  let report: unknown = raw;
  if (typeof raw === 'string') {
    try {
      report = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof report !== 'object' || report === null) return null;
  const asOf = (report as Record<string, unknown>).as_of;
  if (typeof asOf !== 'object' || asOf === null) return null;
  const block = (asOf as Record<string, unknown>).block;
  const n = typeof block === 'number' ? block : typeof block === 'string' ? Number(block) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Pokter's own verdict on one position. */
export function statusOf(position: Pick<V3Position, 'open' | 'inRange'>): RangeStatus {
  if (!position.open) return 'closed';
  return position.inRange ? 'in-range' : 'out-of-range';
}

/**
 * The status the agent gave each position, by position id.
 *
 * Centreline labels a position `"#7674122 CAKE/USDT 0.25%"`, so the id is
 * read from the leading `#`. An answer that names no position at all
 * returns an empty map, which grades as every position unanswered rather
 * than as agreement.
 */
/**
 * Whether the answer says it stopped short.
 *
 * An agent may cap how many positions it reads, and Centreline says so
 * ("Only the first 20 positions were read."). A position missing from a
 * truncated answer is a limit the agent declared, not a position it
 * overlooked, so it is set aside instead of counted against it. Pokter
 * reads fewer positions than that cap, so this should stay rare.
 */
export function answerTruncated(answer: { text: string | null; data: Record<string, unknown> | null }): boolean {
  const note = answer.data?.note;
  if (typeof note === 'string' && /only the first \d+ positions/i.test(note)) return true;
  return typeof answer.text === 'string' && /only the first \d+ positions/i.test(answer.text);
}

export function readV3Answer(answer: { text: string | null; data: Record<string, unknown> | null }): Map<string, string> {
  const byId = new Map<string, string>();
  const positions = answer.data?.positions;
  if (!Array.isArray(positions)) return byId;
  for (const entry of positions) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const label = typeof row.position === 'string' ? row.position : typeof row.id === 'string' ? row.id : '';
    const id = /#?(\d+)/.exec(label)?.[1];
    const status = typeof row.status === 'string' ? row.status : null;
    if (id && status) byId.set(id, status);
  }
  return byId;
}

/**
 * One row per position Pokter read, from the job that paid for the answer.
 *
 * A position the agent did not mention is a miss, not a pass: the brief
 * asked about the wallet, and leaving one out is how an answer looks
 * complete while omitting the position that matters.
 */
export function gradePaidV3Scenarios(input: {
  jobId: string;
  /** The stored manifest, or null when the job has delivered nothing. */
  manifestText: string | null;
  /** Whether the job can still deliver: funded, and not past its deadline. */
  deliveryOpen?: boolean;
  /** Pokter's reading of the same wallet, taken at grading time. */
  reading: V3Reading | null;
  readAt: string;
}): AssayScenarioResult[] {
  const base = { jobId: input.jobId, latencyMs: null };
  /*
   * A row about the whole wallet rather than one position, keyed by its job.
   * These were keyed by the word alone ("delivery", "reading"), so two
   * sampled wallets that both ended there gave one run two rows with the
   * same scenario, the store's unique key refused the write, and the paid
   * check route failed with an empty 500 for every later request.
   */
  const walletRow = (name: string) => `${name} (job ${input.jobId})`;

  if (input.manifestText === null) {
    const row: AssayScenarioResult = {
      ...base,
      scenario: walletRow('delivery'),
      expected: null,
      observed: null,
      excerpt: null,
      pass: false,
      outcome: input.deliveryOpen ? 'pending' : 'undelivered',
      reason: input.deliveryOpen
        ? 'The job is funded and its deadline has not passed; the agent may still deliver.'
        : 'The job was funded and its window closed with no deliverable submitted.',
    };
    return [row];
  }

  if (!input.reading) {
    return [{ ...base, scenario: walletRow('reading'), expected: null, observed: null, excerpt: null, pass: false, outcome: 'not-comparable', reason: 'Pokter could not read this wallet’s positions, so the answer has nothing to be compared with.' }];
  }

  const answer = answerFromManifest(input.manifestText);
  if (!answer) {
    return [{ ...base, scenario: walletRow('answer'), expected: null, observed: null, excerpt: null, pass: false, outcome: 'unreadable', reason: 'The delivered manifest carried no readable answer.' }];
  }

  const said = readV3Answer(answer);
  const truncated = answerTruncated(answer);
  /* Where and when Pokter read the reference, kept on every row so the comparison can name its block. */
  const at = { block: input.reading.block.toString(), readAt: input.readAt };

  /*
   * An answer that names none of the wallet's positions did not do the
   * task, whenever it was written. Timing only matters when the answer and
   * Pokter can disagree about a position's range; with nothing named there
   * is nothing to place in time. Venus Rate Router's jobs 1520 and 1521
   * returned its own Venus status report for both wallets, stated no block,
   * and so were set aside rather than counted as unanswered.
   */
  if (said.size === 0 && !truncated && input.reading.positions.length > 0) {
    return input.reading.positions.map((position) => {
      const expected = statusOf(position);
      return {
        ...base,
        scenario: `#${position.id}`,
        expected: { status: expected, ...at },
        observed: null,
        excerpt: null,
        pass: false,
        outcome: 'unanswered' as const,
        reason: `The answer names none of this wallet's positions. Pokter read this one as ${expected} at block ${input.reading!.block}.`,
      };
    });
  }

  /*
   * Too far apart to compare: every row is set aside, agreement included.
   * An answer with no stated block cannot be placed in time at all, so it
   * is treated the same way rather than given the benefit of the doubt.
   */
  const answerBlock = answerReadBlock(input.manifestText);
  const gap = answerBlock === null ? null : Math.abs(Number(input.reading.block) - answerBlock);
  if (gap === null || gap > V3_COMPARABLE_BLOCKS) {
    const why = gap === null
      ? 'The delivery does not say which block it read, so it cannot be placed against Pokter’s reading.'
      : `The delivery read block ${answerBlock} and Pokter read ${input.reading.block}, ${gap.toLocaleString('en-US')} blocks apart; a price can cross a bound in between.`;
    const rows = input.reading.positions.length > 0 ? input.reading.positions : [null];
    return rows.map((position) => ({
      ...base,
      scenario: position ? `#${position.id}` : walletRow('reading'),
      expected: position ? { status: statusOf(position), ...at } : null,
      observed: position ? { status: said.get(position.id) ?? null } : { positions: said.size },
      excerpt: null,
      pass: false,
      outcome: 'not-comparable',
      reason: why,
    }));
  }

  /*
   * A wallet with no positions is still a check: the agent must say so
   * rather than invent one. Graded as a single row, because there is no
   * position to make a row from.
   */
  if (input.reading.positions.length === 0) {
    const invented = said.size > 0;
    return [{
      ...base,
      scenario: walletRow('no-positions'),
      expected: { positions: 0, ...at },
      observed: { positions: said.size },
      excerpt: null,
      pass: !invented,
      outcome: invented ? 'wrong' : 'correct',
      reason: invented
        ? `Pokter found no v3 position in this wallet; the answer reported ${said.size}.`
        : 'Correct: no position in this wallet, and none claimed.',
    }];
  }

  return input.reading.positions.map((position) => {
    const expected = statusOf(position);
    const observed = said.get(position.id) ?? null;
    const scenario = `#${position.id}`;
    if (observed === null) {
      return truncated
        ? { ...base, scenario, expected: { status: expected, ...at }, observed: null, excerpt: null, pass: false, outcome: 'not-comparable', reason: `The answer says it read only its first positions and does not reach this one, so it is not counted. Pokter read it as ${expected}.` }
        : { ...base, scenario, expected: { status: expected, ...at }, observed: null, excerpt: null, pass: false, outcome: 'unanswered', reason: `The answer does not mention this position. Pokter read it as ${expected} at block ${input.reading!.block}.` };
    }
    const pass = observed === expected;
    return {
      ...base,
      scenario,
      expected: { status: expected, ...at },
      observed: { status: observed },
      excerpt: null,
      pass,
      outcome: pass ? 'correct' : 'wrong',
      reason: pass
        ? `Correct: ${expected} at tick ${position.tick} in [${position.tickLower}, ${position.tickUpper}).`
        : `Pokter read ${expected} at tick ${position.tick} in [${position.tickLower}, ${position.tickUpper}); the answer said ${observed}.`,
    };
  });
}
