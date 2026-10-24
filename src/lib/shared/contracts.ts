/**
 * The shapes the hire flow (Agent 1) and ProofRun (Agent 2) exchange.
 *
 * Types only, and each one wraps what already exists rather than restating
 * it: the prepared brief is the one `prepare_hire` writes down, a delivery's
 * hash match is `manifestMatch`'s, and hashing is `canonicalJson` from
 * `erc8183/negotiation`. See docs/design/shared-interfaces.md.
 */
import type { Address } from 'viem';

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

/* ---------- what a delivery must satisfy ---------- */

export interface Criterion {
  /** Stable across versions of the same criteria set. */
  id: string;
  /** What a buyer reads. */
  label: string;
  check: {
    /** JSON path into the deliverable. */
    field: string;
    comparator: 'equals' | 'within' | 'at-least' | 'at-most' | 'present';
    /** Absent when the expected value is recomputed from chain at check time. */
    expected?: string | number | boolean;
    /** In the field's own units. */
    tolerance?: number;
  };
}

/**
 * What a delivery must satisfy, stated before the job is funded.
 *
 * Optional per brief: most jobs have none, and a job without one is never
 * reported as verified.
 */
export interface AcceptanceSpec {
  criteria: Criterion[];
  /** keccak256 of `canonicalJson(criteria)`, so a receipt can be checked against what was agreed. */
  specHash: string;
  /**
   * Whether the agent agreed to these criteria or Pokter only recorded them.
   *
   * `signed-terms` only when `negotiationTermsBound()` holds and the spec
   * hash appears in the `success_criteria` of the terms the agent signed.
   * Anything else is `pokter-asserted`, and is shown as recorded by Pokter,
   * not agreed by the agent.
   */
  binding: { kind: 'signed-terms' | 'pokter-asserted'; negotiationHash?: string; boundAt?: string };
  /** The deployment is named, never implied by the chain id. */
  subject: { chainId: number; protocol: 'venus-core-pool'; deployment: Address; blockNumber?: string; blockHash?: string };
  versions: { criteria: string; verifier: string };
}

/* ---------- a verifier's answer ---------- */

/**
 * The summary. Never `verified` on a timeout, an unknown or an unsupported
 * case. `contradicted` is verifiers disagreeing: unresolved, never passed.
 */
export type VerificationState = 'verified' | 'mismatch' | 'unverifiable' | 'pending' | 'error' | 'contradicted';

/** Exactly three outcomes reach a buyer. Why a check is not verified stays in `limitation`. */
export interface CheckResult {
  id: string;
  label: string;
  outcome: 'passed' | 'failed' | 'not-verified';
  expected: string;
  observed: string;
  source: { block: string | null; hash: string | null };
  tolerance: string | null;
  limitation?: string;
}

export interface VerificationResult {
  state: VerificationState;
  job: JobRef;
  /** ISO time of the check. */
  checkedAt: string;
  /** The checker that ran, e.g. "venus-health-factor@1". */
  method: string;
  /** One line a buyer reads first. */
  headline: string;
  checks: CheckResult[];
  /** Where each checked figure came from: contract, call, block. */
  evidence: string[];
  limitations: string[];
  /** The spec these checks were run against, when there was one. */
  specHash?: string;
  /** Where to replay the check, when ProofRun recorded one. */
  replayRef?: string;
  /** Fixture, simulation, sponsored test or real customer work, so no surface counts one as another. */
  provenance: 'fixture' | 'simulation' | 'sponsored' | 'customer';
}
