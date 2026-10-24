import { keccak256, toHex } from 'viem';

import type { VenusReportVerification } from '@/lib/delivery/venus-report-check';
import type { AcceptanceSpec, JobRef, VerificationResult } from '@/lib/shared/contracts';
import { venusAcceptanceSpec } from './acceptance';
import { buildArtifact, type SealedArtifact } from './artifact';
import { checksFromVerification, headlineFor, stateFromChecks } from './checks';
import { VERIFIER_VERSION } from './versions';

/**
 * One ProofRun: the existing Venus verdict, expressed as named checks and
 * sealed into something somebody else can replay.
 *
 * Pure. It takes a verdict that has already been computed by
 * `verifyVenusReport` and adds no comparison of its own — the whole point
 * of the split is that there is exactly one thing in this repository that
 * decides whether a report agrees with the chain, and it is not this file.
 *
 * Nothing here is persisted, and that is a decision rather than an
 * omission. A run is a function of the job, the delivered bytes and the
 * chain state at a named block, all three of which are already stored or
 * already immutable — so the artifact can be recomputed on demand instead
 * of being kept in a fourth place that could disagree with the other
 * three. It also means ProofRun adds no database and needs no deployment
 * change to ship.
 */

export interface ProofRunInput {
  job: JobRef | null;
  account: string;
  deployment: `0x${string}`;
  chainId: number;
  verification: VenusReportVerification;
  manifestText: string | null;
  brief: string | null;
  blockHash: string | null;
  provenance: VerificationResult['provenance'];
  spec?: AcceptanceSpec;
  checkedAt?: string;
}

export interface ProofRun {
  result: VerificationResult;
  sealed: SealedArtifact;
}

/** keccak of the bytes, or null. Used for the deliverable and the brief alike. */
export function hashBytes(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return keccak256(toHex(value));
}

export function proofRun(input: ProofRunInput): ProofRun {
  const spec = input.spec ?? venusAcceptanceSpec({ deployment: input.deployment, chainId: input.chainId });
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const checks = checksFromVerification({
    verification: input.verification,
    criteria: spec.criteria,
    blockHash: input.blockHash,
  });
  const state = stateFromChecks(checks);

  const sealed = buildArtifact({
    provenance: input.provenance,
    job: input.job,
    subject: {
      chainId: input.chainId,
      protocol: 'venus-core-pool',
      deployment: input.deployment,
      account: input.account,
      blockNumber: input.verification.block ?? '',
      blockHash: input.blockHash,
    },
    spec: {
      ...spec,
      /*
       * The block is recorded on the spec's subject as well as the
       * artifact's, because a receipt is read on its own and a reader
       * comparing the criteria against the state they were checked at
       * should not have to hold two objects at once.
       */
      subject: {
        ...spec.subject,
        ...(input.verification.block ? { blockNumber: input.verification.block } : {}),
        ...(input.blockHash ? { blockHash: input.blockHash } : {}),
      },
    },
    deliverableHash: hashBytes(input.manifestText),
    briefHash: hashBytes(input.brief),
    checks,
    state,
    checkedAt,
    evidence: input.verification.evidence,
    limitations: input.verification.limitations,
  });

  return {
    result: {
      state,
      job: input.job ?? { chainId: input.chainId, jobId: '' },
      checkedAt,
      method: VERIFIER_VERSION,
      headline: headlineFor(checks),
      checks,
      evidence: input.verification.evidence,
      limitations: input.verification.limitations,
      specHash: spec.specHash,
      replayRef: input.job ? replayRef(input.job) : undefined,
      provenance: input.provenance,
    },
    sealed,
  };
}

/**
 * Where a run can be read and replayed.
 *
 * Job-keyed rather than run-keyed, because a run is recomputed rather than
 * stored: there is no run id to put in a URL, and inventing one would
 * imply a record that does not exist.
 */
export function replayRef(job: JobRef): string {
  return `/proofrun/${job.chainId}/${job.jobId}`;
}

export function artifactHref(job: JobRef): string {
  return `/api/proofrun/${job.chainId}/${job.jobId}/artifact.json`;
}
