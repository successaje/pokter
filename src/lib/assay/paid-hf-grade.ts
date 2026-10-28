import { answerAccount, judgeHf, readHfAnswer, type HfExpected } from './health-factor';
import { answerFromManifest } from './paid-grade';
import type { AssayScenarioResult } from './types';

/**
 * Grading a paid health-factor delivery, where the right answer moves.
 *
 * The free check reads Venus just before and just after the agent replies,
 * so the two readings bracket the answer. A paid hire cannot work that way:
 * it is funded in one request and delivered minutes or hours later, and
 * graded later still.
 *
 * Re-reading Venus at the block the artifact says it read would be exact,
 * and is not available — every free BNB Chain endpoint refuses historical
 * state ("missing trie node", "archive requests require a personal
 * endpoint") beyond about ten blocks. So the comparison is against a
 * reading taken at grading time, and staleness is handled explicitly
 * rather than silently:
 *
 *  - Agreeing with a later reading still passes. Drift cannot invent a
 *    pass, so there is no reason to withhold one.
 *  - Disagreeing is only called wrong when the artifact was read close
 *    enough to the reading to be comparable. Otherwise it is recorded as
 *    `not-comparable`, which is not a pass and not a failure the agent
 *    earned — the position moved under it.
 *
 * That asymmetry is the whole design: a correctness page must never
 * publish a failure that belongs to the clock.
 */

/**
 * How far apart the artifact and the reading may be and still be compared.
 *
 * Fifteen minutes, the same order as the quote validity a buyer already
 * lives with. A health factor is a ratio of two USD sums and moves with
 * the oracle, so minutes are usually immaterial and hours are not.
 */
export const HF_COMPARABLE_MS = 15 * 60 * 1000;

/** When the agent says it read the position, from the artifact's own `as_of`. */
export function artifactReadAt(manifestText: string): string | null {
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
  const time = (asOf as Record<string, unknown>).time;
  if (typeof time !== 'string') return null;
  return Number.isFinite(Date.parse(time)) ? time : null;
}

export function gradePaidHfScenario(input: {
  /** The account the fixture asked about; the scenario's id. */
  account: string;
  jobId: string;
  /** The stored manifest, or null when the job has delivered nothing. */
  manifestText: string | null;
  /** Whether the job can still deliver: funded, and not past its deadline. */
  deliveryOpen?: boolean;
  /** Pokter's reading of the same position, taken at grading time, with the block it was read at. */
  reading: (HfExpected & { block?: string }) | null;
  /** When that reading was taken. */
  readAt: string;
}): AssayScenarioResult {
  const base = {
    scenario: input.account.toLowerCase(),
    expected: input.reading ? { ...input.reading, readAt: input.readAt } : null,
    jobId: input.jobId,
    latencyMs: null,
  };

  if (input.manifestText === null) {
    return input.deliveryOpen
      ? { ...base, observed: null, excerpt: null, pass: false, outcome: 'pending', reason: 'The job is funded and its deadline has not passed; the agent may still deliver.' }
      : { ...base, observed: null, excerpt: null, pass: false, outcome: 'undelivered', reason: 'The job was funded and its window closed with no deliverable submitted.' };
  }
  if (!input.reading) {
    return { ...base, observed: null, excerpt: null, pass: false, outcome: 'not-comparable', reason: 'Pokter could not read this position from Venus, so the answer has nothing to be compared with.' };
  }

  const answer = answerFromManifest(input.manifestText);
  if (!answer) {
    return { ...base, observed: null, excerpt: null, pass: false, outcome: 'unreadable', reason: 'The delivered manifest carried no readable answer.' };
  }

  const excerptOf = () => (answer.data ? JSON.stringify(answer.data).slice(0, 400) : (answer.text ?? '').slice(0, 400));
  /*
   * About another wallet, or with no health factor at all: neither is
   * explained by when the position was read, so neither is excused by the
   * timing rule below. Mandate Guard-1 answered all three fixtures about
   * its own provider wallet ("no Venus position on this address") and was
   * set aside as not comparable, because it gave no time and no number.
   */
  const about = answerAccount(answer);
  if (about && about.toLowerCase() !== input.account.toLowerCase()) {
    return { ...base, observed: { account: about }, excerpt: excerptOf(), pass: false, outcome: 'wrong', reason: `Answered about ${about}, not the account asked about (${input.account}).` };
  }
  const observed = readHfAnswer(answer);
  if (!observed) {
    return { ...base, observed: null, excerpt: excerptOf(), pass: false, outcome: 'unanswered', reason: 'The answer gives no health factor for the account asked about.' };
  }
  const verdict = judgeHf([input.reading], observed, { expectedAccount: input.account });
  const excerpt = answer.data ? JSON.stringify(answer.data).slice(0, 400) : (answer.text ?? '').slice(0, 400);

  const readAt = artifactReadAt(input.manifestText);
  const gap = readAt === null ? null : Math.abs(Date.parse(input.readAt) - Date.parse(readAt));

  if (verdict.pass) {
    /*
     * A match counts on the same terms as a mismatch. A disagreement more
     * than fifteen minutes apart is not held against the agent because the
     * position may have moved; by the same reasoning an agreement that far
     * apart may be a stale answer that happens to match a position that did
     * not move, and a check that counted those and excused the others would
     * lean towards passing. So outside the window it counts neither way.
     */
    if (gap === null || gap > HF_COMPARABLE_MS) {
      return {
        ...base,
        observed,
        excerpt,
        pass: false,
        outcome: 'not-comparable',
        reason:
          gap === null
            ? `${verdict.reason} The delivery does not say when it read the position, so a match cannot be told from a stale answer; it is not counted either way.`
            : `${verdict.reason} It read the position ${Math.round(gap / 60_000)} minutes from Pokter's reading, too far apart to tell a match from a stale answer; it is not counted either way.`,
      };
    }
    // Say what a pass here is: agreement with a reading close in time, not proof of the exact block.
    const gapMinutes = Math.round(gap / 60_000);
    const basis =
      gapMinutes <= 1
        ? ' Compared with Pokter’s reading taken within a minute of the agent’s.'
        : ` Compared with Pokter’s reading ${gapMinutes} minutes after the agent’s: consistent with the position, not proof it was exact at the block the agent read.`;
    return { ...base, observed, excerpt, pass: true, outcome: verdict.outcome, reason: verdict.reason + basis };
  }

  /*
   * A failure is only the agent's when the two were taken close together.
   * `borrow-limit` is exempt: answering the borrowing-limit ratio instead
   * of the liquidation-threshold one is a definitional error that staleness
   * cannot explain, and it is the single most useful thing this check finds.
   */
  const comparable = verdict.outcome === 'borrow-limit' || (gap !== null && gap <= HF_COMPARABLE_MS);

  if (comparable) {
    return { ...base, observed, excerpt, pass: false, outcome: verdict.outcome, reason: verdict.reason };
  }

  return {
    ...base,
    observed,
    excerpt,
    pass: false,
    outcome: 'not-comparable',
    reason:
      gap === null
        ? `${verdict.reason} The delivery does not say when it read the position, so this disagreement cannot be attributed to the agent.`
        : `${verdict.reason} It read the position ${Math.round(gap / 60_000)} minutes from Pokter's reading, so the position may have moved; this is not counted against the agent.`,
  };
}
