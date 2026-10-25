import { getAddress } from 'viem';

import { decodePokterJobEnvelope, decodeReferenceJobDescription } from '@/lib/erc8183/job-envelope';
import { sanitizeForClaim } from '@/lib/erc8183/negotiation';
import type { AcceptanceSpec } from '@/lib/shared/contracts';

import { bindingFor } from './acceptance';

/**
 * What the agent agreed to, recorded at quote time and read back at
 * receipt time.
 *
 * The quote route computes a binding and returns it in a response body that
 * nothing keeps. By the time a receipt is written the signature, the
 * criteria it covered and the terms it was over are all gone, so the
 * receipt page had no way to know an agreement had happened and built every
 * real job's spec from the scenario default — `pokter-asserted`, for jobs
 * where the agent had signed.
 *
 * This is the record that survives in between, and the rule for deciding
 * whether it belongs to the job in front of us.
 */
export interface CriteriaAgreement {
  /** Keyed by this: it is the one value that is also on chain. */
  negotiationHash: string;
  specHash: string;
  /** What Pokter sent, in the order it sent them. */
  sentCriteria: string[];
  /** What the agent signed, or null when it echoed none. */
  signedCriteria: string[] | null;
  /** `negotiationTermsBound()`'s answer at quote time. */
  termsBound: boolean;
  /** The exact brief the signature covers. */
  task: string;
  provider: string;
  escrowChainId: number;
  quotedAt: string;
}

/**
 * The job's negotiation hash, from the description the escrow holds.
 *
 * This is what makes the link exact rather than approximate. Both
 * description formats carry it: Pokter's envelope keeps the quote beside
 * the identity, and a reference-anchored job *is* the quote. So the hash a
 * stored agreement is keyed by is also written on chain, in the job being
 * read — a stored row cannot drift onto a job it was not quoted for, and
 * nothing here has to trust an index to say which quote belonged to which
 * job.
 *
 * Null when the description is neither format, or carries no quote. A job
 * funded outside Pokter's quote route is exactly that case, and it must
 * come back null rather than fall through to some looser match.
 */
export function negotiationHashOnChain(description: string): string | null {
  const envelope = decodePokterJobEnvelope(description);
  if (envelope) return envelope.quote?.negotiationHash.toLowerCase() ?? null;
  const reference = decodeReferenceJobDescription(description);
  return reference ? reference.quote.negotiationHash.toLowerCase() : null;
}

/** Why an agreement was not applied, for the receipt to state plainly. */
export type AgreementRefusal =
  | 'no-agreement'
  | 'hash-mismatch'
  | 'provider-mismatch'
  | 'chain-mismatch'
  | 'task-mismatch'
  | 'spec-mismatch';

export interface AgreementVerdict {
  binding: AcceptanceSpec['binding'];
  /** Null when the agreement was applied; otherwise what stopped it. */
  refusal: AgreementRefusal | null;
}

const POKTER_ASSERTED: AcceptanceSpec['binding'] = { kind: 'pokter-asserted' };

function sameAddress(a: string, b: string): boolean {
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}

/**
 * Whether this agreement is this job's, and what it binds.
 *
 * Every branch that is not a complete match returns `pokter-asserted`.
 * That is the whole design: `signed-terms` is a claim that a named party
 * put their signature over these exact criteria for this exact job, and
 * anything less than complete evidence for that is not a weaker version of
 * the claim — it is a different claim, and making it would be the
 * misrepresentation the binding exists to prevent.
 *
 * So a missing row, a hash that does not match the chain, a different
 * provider, a different escrow, a different brief, or a spec other than the
 * one agreed all come back asserted. None of them is treated as a partial
 * match, and none of them is reported as an error either: a job with no
 * agreement is the ordinary case and reads exactly as it did before.
 */
export function agreementVerdict(input: {
  /** The row found for this job's on-chain hash, if any. */
  agreement: CriteriaAgreement | null;
  job: {
    /** The negotiation hash read from the job's own description. */
    negotiationHash: string | null;
    provider: string;
    escrowChainId: number;
    /** The brief as the job records it. */
    task: string;
  };
  /** The spec the receipt is about to check against. */
  spec: Pick<AcceptanceSpec, 'specHash'>;
}): AgreementVerdict {
  const { agreement, job, spec } = input;
  if (!agreement || !job.negotiationHash) return { binding: POKTER_ASSERTED, refusal: 'no-agreement' };

  /*
   * The row is keyed by hash, so a lookup by the chain's hash should
   * already agree. Checked anyway: a caller that looked the row up some
   * other way would otherwise bind a job to a quote it never carried, and
   * this function is the only thing standing between that and a published
   * claim.
   */
  if (agreement.negotiationHash.toLowerCase() !== job.negotiationHash.toLowerCase()) {
    return { binding: POKTER_ASSERTED, refusal: 'hash-mismatch' };
  }
  if (!sameAddress(agreement.provider, job.provider)) return { binding: POKTER_ASSERTED, refusal: 'provider-mismatch' };
  if (agreement.escrowChainId !== job.escrowChainId) return { binding: POKTER_ASSERTED, refusal: 'chain-mismatch' };

  /*
   * The signature covers the task, and the escrow holds the task it was
   * funded for. Compared after the same sanitising the hash was computed
   * over, because that is the form the signature actually covered — a
   * bracket in the brief is otherwise a mismatch between two spellings of
   * the same agreement.
   */
  if (sanitizeForClaim(agreement.task) !== sanitizeForClaim(job.task)) {
    return { binding: POKTER_ASSERTED, refusal: 'task-mismatch' };
  }

  /*
   * The criteria version moved, or the deployment did. The agent agreed to
   * a different document from the one about to be checked, and reporting
   * that as agreement would be the subtlest way to get this wrong.
   */
  if (agreement.specHash.toLowerCase() !== spec.specHash.toLowerCase()) {
    return { binding: POKTER_ASSERTED, refusal: 'spec-mismatch' };
  }

  /*
   * Recomputed, never read back. `bindingFor` fails closed on its own —
   * it requires the terms to have been bound and the spec line to be
   * inside what the agent signed — and recomputing means a row written by
   * an older version of that rule is judged by today's.
   */
  const binding = bindingFor({
    specHash: agreement.specHash,
    termsBound: agreement.termsBound,
    signedCriteria: agreement.signedCriteria ?? undefined,
    sentCriteria: agreement.sentCriteria,
    negotiationHash: agreement.negotiationHash,
  });
  return { binding, refusal: binding.kind === 'signed-terms' ? null : 'no-agreement' };
}
