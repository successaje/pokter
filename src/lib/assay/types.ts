/**
 * What a correctness check records, without a database behind it.
 *
 * These lived in `assay/store.ts`, which is `server-only`, so anything that
 * reasoned about a run had to be server code too — including the judges,
 * which are pure arithmetic and deserve tests that import them directly.
 * The store re-exports these, so every existing import still resolves.
 */

/**
 * How a check reached the agent.
 *
 * - `free-call`: asked directly, outside escrow. Cheap and repeatable, and
 *   the only thing the first version could do.
 * - `paid-hire`: graded from the artifact a funded ERC-8183 job delivered.
 *
 * The distinction is the point rather than bookkeeping. An agent that sells
 * its work answers a direct call with a price, which records as `paid-only`
 * and can never pass — so the agents with real customers were the ones
 * Pokter could not check. A paid-hire check also grades what a buyer
 * actually receives, which is the thing worth being right about.
 */
export type AssayVia = 'free-call' | 'paid-hire';

export type AssayRunStatus = 'checked' | 'not-askable' | 'paid-only';

export interface AssayScenarioResult {
  scenario: string;
  expected: unknown;
  observed: unknown;
  excerpt: string | null;
  pass: boolean;
  /** correct, borrow-limit (a different definition), wrong, or unreadable. */
  outcome: string;
  reason: string;
  latencyMs: number | null;
  /** The ERC-8183 job that paid for this answer, on a paid-hire check. */
  jobId?: string | null;
}

export interface AssayRun {
  suite: string;
  status: AssayRunStatus;
  /** Why the agent could not be asked, or why it was not checked (paid only). */
  detail: string | null;
  passed: number;
  total: number;
  ranAt: string;
  via: AssayVia;
  results: AssayScenarioResult[];
  /**
   * Which revision of the grading rules produced this run (`GRADING_RULES`).
   * 0 for every run recorded before the field existed.
   */
  rules?: number;
}
