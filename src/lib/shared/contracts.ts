/**
 * The four shapes the hire flow (Agent 1) and ProofRun (Agent 2) exchange.
 *
 * Types only, and each one wraps what already exists rather than restating
 * it: the prepared brief is the one `prepare_hire` writes down, a delivery's
 * hash match is `manifestMatch`'s, and a verification maps one to one onto
 * the Venus report check's verdict. See docs/design/shared-interfaces.md.
 */
import type { PreparedBrief as HirePreparedBrief } from '@/lib/assistant/hire-request';
import type { ManifestMatch } from '@/lib/erc8183/manifest-match';

/** The exact task an agent is quoted and hired on. Owned by the hire flow. */
export type PreparedBrief = HirePreparedBrief;

/** One escrow job, wherever it is referenced. */
export interface JobRef {
  /** The escrow's chain: 56 or 97. */
  chainId: number;
  jobId: string;
}

/** What was delivered for a job, as far as Pokter has read it. */
export interface DeliveryRef extends JobRef {
  /** The URL the agent published, or null when none could be read. */
  deliverableUrl: string | null;
  /** The bytes32 the agent committed on chain, or null before submission. */
  onchainHash: string | null;
  /** How the served bytes matched that hash; null when they did not, or were not read. */
  matchedBy: ManifestMatch | null;
}

/**
 * What a delivery must satisfy, stated before the job is funded.
 *
 * Optional per brief: most jobs have none, and a job without one is never
 * reported as verified. `kind` names the checker; only kinds a checker
 * exists for may be offered to a buyer.
 */
export interface AcceptanceSpec {
  version: 1;
  kind: string;
  /** Fields of the deliverable the checker recomputes, by JSON path. */
  recompute: string[];
  /** Per-field tolerance, in the field's own units, where exact equality is wrong. */
  tolerance?: Record<string, number>;
  /** The chain state the claim is bound to: a block the report names, or "head at delivery". */
  boundTo: 'reported-block' | 'delivery-block';
}

/**
 * A verifier's answer. Never `verified` on a timeout, an unknown or an
 * unsupported case: those are `unverifiable` or `error`, with why.
 */
export type VerificationState = 'verified' | 'mismatch' | 'unverifiable' | 'pending' | 'error';

export interface VerificationResult {
  state: VerificationState;
  job: JobRef;
  /** ISO time of the check. */
  checkedAt: string;
  /** The checker that ran, e.g. "venus-health-factor@1". */
  method: string;
  /** One line a buyer reads first. */
  headline: string;
  /** Per-field outcome, in a reader's terms. */
  details: Array<{ label: string; reported: string; checked: string; agrees: boolean | null; note?: string }>;
  /** Where each checked figure came from: contract, call, block. */
  evidence: string[];
  limitations: string[];
  /** Where to replay the check, when ProofRun recorded one. */
  replayRef?: string;
  /**
   * Fixture, simulation, sponsored test or real customer work. Kept on the
   * result so no surface can count one as another.
   */
  provenance: 'fixture' | 'simulation' | 'sponsored' | 'customer';
}
