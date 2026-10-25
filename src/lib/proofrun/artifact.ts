import { keccak256, toHex } from 'viem';

import { canonicalJson } from '@/lib/erc8183/negotiation';
import type { AcceptanceSpec, CheckResult, JobRef, VerificationResult } from '@/lib/shared/contracts';
import { ARTIFACT_VERSION, CRITERIA_VERSION, VERIFIER_VERSION } from './versions';

/**
 * The receipt a ProofRun produces, and the thing somebody else can replay.
 *
 * What it is for: a buyer holding a verdict from Pokter has to take
 * Pokter's word for it. This is the smallest object that lets them stop
 * doing that — the criteria that were agreed, the exact state the checks
 * were run against, what each check observed, and enough references to
 * re-read the chain without asking Pokter anything.
 *
 * What it is not: proof the report was right. The artifact's own hash
 * establishes that these bytes are the bytes that were produced, and
 * nothing more. Whether the figures inside are true still rests on the
 * RPC that served the state, and a replay that reads a different node can
 * legitimately disagree. `replayArtifact` reports that as a contradiction
 * and never as a pass.
 *
 * Unsigned. There is no key here and no signature field to fill in: a
 * signed receipt is a separate object requiring a signing credential
 * nobody has approved, and leaving a `signature: null` on an unsigned
 * artifact invites a reader to think one was expected and omitted.
 */

export interface ArtifactSubject {
  chainId: number;
  protocol: 'venus-core-pool';
  deployment: string;
  /** The account the report is about. */
  account: string;
  /** Both, always: a number alone does not pin state across a reorg. */
  blockNumber: string;
  blockHash: string | null;
}

export interface ProofRunArtifact {
  version: typeof ARTIFACT_VERSION;
  /** Fixture and simulation runs say so here, so no reader counts one as customer work. */
  provenance: VerificationResult['provenance'];
  job: JobRef | null;
  subject: ArtifactSubject;
  criteria: AcceptanceSpec['criteria'];
  specHash: string;
  binding: AcceptanceSpec['binding'];
  /** keccak of the delivered manifest bytes, so the artifact names what it judged. */
  deliverableHash: string | null;
  /**
   * The brief by hash, never by text.
   *
   * A brief can name a wallet, a position and an intention, and an
   * artifact is meant to be shareable. The hash is enough to show a
   * receipt belongs to one particular job and not another, which is all a
   * replay needs from it.
   */
  briefHash: string | null;
  versions: { criteria: string; verifier: string; artifact: typeof ARTIFACT_VERSION };
  checks: CheckResult[];
  state: VerificationResult['state'];
  checkedAt: string;
  evidence: string[];
  limitations: string[];
}

/** The artifact minus its own hash, which is what the hash is taken over. */
type Unhashed = Omit<ProofRunArtifact, never>;

export interface SealedArtifact {
  artifact: ProofRunArtifact;
  /** keccak256 of canonicalJson(artifact). Consistency, not correctness. */
  artifactHash: string;
}

export function hashArtifact(artifact: Unhashed): string {
  return keccak256(toHex(canonicalJson(artifact)));
}

export function sealArtifact(artifact: ProofRunArtifact): SealedArtifact {
  return { artifact, artifactHash: hashArtifact(artifact) };
}

export type ArtifactIntegrity =
  | { ok: true }
  | { ok: false; reason: 'tampered'; detail: string }
  | { ok: false; reason: 'unreadable'; detail: string };

/**
 * Whether these bytes are the bytes that were sealed.
 *
 * Recomputes rather than compares a stored field, so an artifact whose
 * hash was edited to match its edited body still fails — the hash is a
 * function of the content and a forger has to produce a keccak collision,
 * not edit two places consistently.
 */
export function checkArtifactIntegrity(sealed: unknown): ArtifactIntegrity {
  if (!sealed || typeof sealed !== 'object' || Array.isArray(sealed)) {
    return { ok: false, reason: 'unreadable', detail: 'The artifact is not an object.' };
  }
  const { artifact, artifactHash } = sealed as Partial<SealedArtifact>;
  if (!artifact || typeof artifact !== 'object') {
    return { ok: false, reason: 'unreadable', detail: 'The artifact has no body.' };
  }
  if (typeof artifactHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(artifactHash)) {
    return { ok: false, reason: 'unreadable', detail: 'The artifact carries no readable hash.' };
  }
  const recomputed = hashArtifact(artifact as ProofRunArtifact);
  if (recomputed.toLowerCase() !== artifactHash.toLowerCase()) {
    return {
      ok: false,
      reason: 'tampered',
      detail: `The artifact does not hash to the value it carries. Recomputed ${recomputed.slice(0, 14)}…, carries ${artifactHash.slice(0, 14)}….`,
    };
  }
  return { ok: true };
}

/**
 * Whether the criteria inside the artifact are the criteria it claims.
 *
 * Separate from the artifact hash because they fail for different reasons
 * and the buyer needs them told apart: a broken artifact hash means
 * somebody edited the receipt, while a broken spec hash means the criteria
 * in the receipt are not the criteria that were agreed and signed — the
 * receipt may be intact and still describe a different agreement.
 */
export function checkSpecIntegrity(artifact: ProofRunArtifact, specHashOf: (c: AcceptanceSpec['criteria']) => string): ArtifactIntegrity {
  const recomputed = specHashOf(artifact.criteria);
  if (recomputed.toLowerCase() !== String(artifact.specHash).toLowerCase()) {
    return {
      ok: false,
      reason: 'tampered',
      detail: `The criteria do not hash to the spec this receipt names. Recomputed ${recomputed.slice(0, 14)}…, carries ${String(artifact.specHash).slice(0, 14)}….`,
    };
  }
  return { ok: true };
}

export type ReplayOutcome =
  | { state: 'agreed'; checks: CheckResult[] }
  | { state: 'contradicted'; checks: CheckResult[]; disagreements: string[] }
  | { state: 'not-verified'; reason: string };

/**
 * Compare a fresh run against a sealed one.
 *
 * Three outcomes and no fourth, and the important one is the middle.
 * Verifiers that disagree are **unresolved**: the replay does not decide
 * which is right, does not prefer the stored verdict because it is stored,
 * and never resolves a disagreement into a pass. The mandate's rule, and
 * the honest one — two readings of the same block that differ mean one of
 * the nodes is wrong, and this code cannot tell which.
 *
 * A check that is `not-verified` on either side is not a disagreement. It
 * is the absence of evidence on one side, which the replay reports as
 * not-verified rather than counting as agreement — the silent-success case
 * the whole feature exists to refuse.
 */
export function compareRuns(sealed: readonly CheckResult[], fresh: readonly CheckResult[]): ReplayOutcome {
  const byId = new Map(fresh.map((check) => [check.id, check]));
  const disagreements: string[] = [];
  let anyUnverified = false;

  for (const original of sealed) {
    const replayed = byId.get(original.id);
    if (!replayed) {
      anyUnverified = true;
      disagreements.push(`${original.id}: the replay produced no result for a check the receipt carries.`);
      continue;
    }
    if (original.outcome === 'not-verified' || replayed.outcome === 'not-verified') {
      anyUnverified = true;
      continue;
    }
    if (original.outcome !== replayed.outcome) {
      disagreements.push(
        `${original.id}: the receipt says ${original.outcome}, the replay says ${replayed.outcome} (observed ${replayed.observed} against ${original.observed}).`,
      );
    }
  }

  if (disagreements.length > 0) return { state: 'contradicted', checks: [...fresh], disagreements };
  if (anyUnverified) {
    return {
      state: 'not-verified',
      reason: 'At least one check could not be re-run, so the replay neither confirms nor contradicts the receipt.',
    };
  }
  return { state: 'agreed', checks: [...fresh] };
}

/** The standing limitations of a replay, said in the artifact rather than in a footnote. */
export const REPLAY_LIMITATIONS = [
  'The hash identifies this run, not this job. `checkedAt` is inside it and a run is recomputed on each request, so two copies fetched a moment apart hash differently without either being altered. Compare a copy against itself, not against a fresh fetch.',
  'The artifact hash shows these bytes are unaltered. It says nothing about whether the figures are correct.',
  'Every observed figure comes from an RPC endpoint. A replay against a different node can legitimately disagree, and that is reported as unresolved rather than as a pass.',
  'Historical state is required. Where the node no longer serves the named block, checks are not verified rather than re-read at the head.',
  'The agent’s own build is not established unless it published one, and is reported as unknown where it did not.',
] as const;

export function buildArtifact(input: {
  provenance: VerificationResult['provenance'];
  job: JobRef | null;
  subject: ArtifactSubject;
  spec: AcceptanceSpec;
  deliverableHash: string | null;
  briefHash: string | null;
  checks: CheckResult[];
  state: VerificationResult['state'];
  checkedAt: string;
  evidence: string[];
  limitations?: string[];
}): SealedArtifact {
  const artifact: ProofRunArtifact = {
    version: ARTIFACT_VERSION,
    provenance: input.provenance,
    job: input.job,
    subject: input.subject,
    criteria: input.spec.criteria,
    specHash: input.spec.specHash,
    binding: input.spec.binding,
    deliverableHash: input.deliverableHash,
    briefHash: input.briefHash,
    versions: { criteria: CRITERIA_VERSION, verifier: VERIFIER_VERSION, artifact: ARTIFACT_VERSION },
    checks: input.checks,
    state: input.state,
    checkedAt: input.checkedAt,
    evidence: input.evidence,
    limitations: [...(input.limitations ?? []), ...REPLAY_LIMITATIONS],
  };
  return sealArtifact(artifact);
}
