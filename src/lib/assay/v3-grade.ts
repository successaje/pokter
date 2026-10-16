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

  if (input.manifestText === null) {
    const row: AssayScenarioResult = {
      ...base,
      scenario: 'delivery',
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
    return [{ ...base, scenario: 'reading', expected: null, observed: null, excerpt: null, pass: false, outcome: 'not-comparable', reason: 'Pokter could not read this wallet’s positions, so the answer has nothing to be compared with.' }];
  }

  const answer = answerFromManifest(input.manifestText);
  if (!answer) {
    return [{ ...base, scenario: 'answer', expected: null, observed: null, excerpt: null, pass: false, outcome: 'unreadable', reason: 'The delivered manifest carried no readable answer.' }];
  }

  const said = readV3Answer(answer);
  const truncated = answerTruncated(answer);

  /*
   * A wallet with no positions is still a check: the agent must say so
   * rather than invent one. Graded as a single row, because there is no
   * position to make a row from.
   */
  if (input.reading.positions.length === 0) {
    const invented = said.size > 0;
    return [{
      ...base,
      scenario: 'no-positions',
      expected: { positions: 0 },
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
        ? { ...base, scenario, expected: { status: expected }, observed: null, excerpt: null, pass: false, outcome: 'not-comparable', reason: `The answer says it read only its first positions and does not reach this one, so it is not counted. Pokter read it as ${expected}.` }
        : { ...base, scenario, expected: { status: expected }, observed: null, excerpt: null, pass: false, outcome: 'unanswered', reason: `The answer does not mention this position. Pokter read it as ${expected} at block ${input.reading!.block}.` };
    }
    const pass = observed === expected;
    return {
      ...base,
      scenario,
      expected: { status: expected },
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
