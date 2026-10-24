import { keccak256, toHex } from 'viem';

import { readVenusReportClaim, type VenusReportVerification } from '@/lib/delivery/venus-report-check';
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
  /**
   * What this particular run could not establish, beyond the standing
   * limits the checker and the artifact already carry.
   *
   * Added because the labelling has to travel *in the receipt*. A
   * fixture built over real chain state — real block, real hash, real
   * figures, written report — is a shape neither scenario kind covers,
   * and once the artifact leaves this repository `provenance: 'fixture'`
   * is the only thing distinguishing it. That is enough to stop it being
   * counted as customer work and not enough to say which half was
   * synthetic. A reader holding the file should not have to find the
   * fixture it came from to learn that.
   */
  limitations?: readonly string[];
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
  /* The same pure reader the checker used, on the same bytes, so the two
     cannot disagree about what the report claimed. */
  const claim = input.manifestText === null ? null : readVenusReportClaim(input.manifestText);
  const checks = checksFromVerification({
    verification: input.verification,
    criteria: spec.criteria,
    blockHash: input.blockHash,
    chainClaim: claim?.ok ? claim.claim.chain : undefined,
    accountNamed: Boolean(claim?.ok && claim.claim.account),
    /* So a row cannot say a criterion was agreed while the spec beside it
       says Pokter only recorded it. */
    binding: spec.binding,
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
    /* The run's own first, then the checker's: a reader meets what is
       particular to this receipt before the standing caveats. */
    limitations: [...(input.limitations ?? []), ...input.verification.limitations],
  });

  return {
    result: {
      state,
      job: input.job,
      checkedAt,
      method: VERIFIER_VERSION,
      headline: headlineFor(checks),
      checks,
      evidence: input.verification.evidence,
      limitations: [...(input.limitations ?? []), ...input.verification.limitations],
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
