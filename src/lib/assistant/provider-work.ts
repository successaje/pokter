import { createHash } from 'node:crypto';

import { canonicalJson } from '@/lib/erc8183/negotiation';

/**
 * One piece of work, however many times an assistant is asked for it.
 *
 * `idempotency.ts` says why the buying side needs this: an assistant
 * retries on a timeout, on a dropped connection, on its own restart, and
 * sometimes because the caller above it asked twice. The selling side has
 * the same exposure and two different things to lose by it.
 *
 *  - **A proposal.** Two proposals for one request would be two signed
 *    offers for the same job. The bids table already enforces one standing
 *    offer per agent per request, so a second one does not stack — but the
 *    assistant would still ask its owner to sign twice, and the owner has
 *    no way to tell a retry from a revision.
 *  - **A delivery.** This is the expensive one. A delivery is an on-chain
 *    transaction that commits a hash, and a second attempt at a job that
 *    has already been delivered is gas spent on a transaction the escrow
 *    refuses. Worse, a restarted assistant that has lost its own memory of
 *    having finished would redo the work itself before discovering that.
 *
 * So both are keyed, and the keys are what the work *is* rather than what
 * the assistant happened to compute:
 *
 *  - A proposal is keyed by the owner, the request and the agent — **not**
 *    the price, the days or the note. Those are the terms of one offer, and
 *    one offer is what a request can hold: re-preparing with a different
 *    price revises the standing proposal instead of becoming a second one.
 *    Keying on the terms would have made every re-price a fresh row and
 *    every re-price a second thing for the owner to sign.
 *  - A delivery is keyed by the owner, the escrow chain and the job id, and
 *    by nothing else at all. There is exactly one delivery per job. Keying
 *    on the content would have meant an assistant that re-ran its work and
 *    produced slightly different text had a new key, found no record, and
 *    staged a second delivery for a job already delivered.
 */

export interface ProposalTerms {
  /** The wallet whose automation prepared it, and whose signature will place it. */
  owner: string;
  requestId: string;
  agentChainId: number;
  agentTokenId: string;
}

export function proposalKey(terms: ProposalTerms): string {
  const material = {
    owner: terms.owner.toLowerCase(),
    request: terms.requestId,
    agent: `${terms.agentChainId}/${terms.agentTokenId}`,
  };
  return `ppr_${createHash('sha256').update(canonicalJson(material)).digest('hex').slice(0, 32)}`;
}

export interface DeliveryTerms {
  owner: string;
  /** The escrow chain, because a job id exists on both deployments. */
  chainId: number;
  jobId: string;
}

export function deliveryKey(terms: DeliveryTerms): string {
  const material = { owner: terms.owner.toLowerCase(), chainId: terms.chainId, job: terms.jobId };
  return `pdl_${createHash('sha256').update(canonicalJson(material)).digest('hex').slice(0, 32)}`;
}

/** The sha256 of the exact bytes staged, so an assistant can recognise its own work after a restart. */
export function contentDigest(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * What to do with a proposal that has been prepared before.
 *
 * `placed` is the state that makes this idempotent: the owner has signed
 * and the proposal is on the request, so nothing further is prepared for
 * it and the assistant is told the bid id instead.
 */
export type ProposalRetry =
  | { action: 'prepare'; message: string }
  | { action: 'reuse'; message: string }
  | { action: 'revise'; message: string }
  | { action: 'placed'; bidId: string; message: string };

/**
 * Whether this decision gives the owner something new to sign.
 *
 * A function rather than a condition at the call site, for the reason
 * `handsOverRequest` is one: the outcomes that must hand over nothing were
 * a boolean expression no test could reach, and narrowing it passed the
 * suite. Here, wrong is a failing test.
 */
export function needsOwnerSignature(action: ProposalRetry['action']): boolean {
  return action !== 'placed';
}

export function proposalRetry(
  recorded: { bidId: string | null; priceU: number; deliverDays: number; note: string } | null,
  asked: { priceU: number; deliverDays: number; note: string },
): ProposalRetry {
  if (!recorded) return { action: 'prepare', message: 'No proposal has been prepared for this request and agent yet.' };
  if (recorded.bidId) {
    return {
      action: 'placed',
      bidId: recorded.bidId,
      message:
        'A proposal for this request and agent has already been signed by the owner and placed. Nothing further was prepared: a second one would ask the owner to sign the same offer twice. Revise it on Pokter if the terms should change.',
    };
  }
  const same =
    Math.round(recorded.priceU * 100) === Math.round(asked.priceU * 100) &&
    recorded.deliverDays === asked.deliverDays &&
    recorded.note === asked.note;
  return same
    ? {
        action: 'reuse',
        message:
          'This proposal was prepared before and is still waiting for the owner’s signature. The same one is returned under the same key; it has not been placed.',
      }
    : {
        action: 'revise',
        message:
          'A proposal for this request and agent was already waiting for the owner’s signature. Its terms were revised rather than a second proposal prepared — a request holds one standing offer per agent.',
      };
}

/**
 * What to do with a deliverable that has been staged before.
 *
 * `submitted` is the guard that matters: a job whose delivery is on chain
 * is finished, and an assistant that restarts mid-job must discover that
 * before it redoes the work rather than after it has paid for a
 * transaction the escrow refuses.
 */
export type DeliveryRetry =
  | { action: 'stage'; message: string }
  | { action: 'reuse'; message: string }
  | { action: 'restage'; message: string }
  | { action: 'submitted'; transactionHash: string; message: string };

export function stagesWork(action: DeliveryRetry['action']): boolean {
  return action !== 'submitted';
}

export function deliveryRetry(
  recorded: { submitTxHash: string | null; contentSha256: string } | null,
  askedSha256: string,
): DeliveryRetry {
  if (!recorded) return { action: 'stage', message: 'Nothing has been staged for this job yet.' };
  if (recorded.submitTxHash) {
    return {
      action: 'submitted',
      transactionHash: recorded.submitTxHash,
      message: `This job was already delivered: the provider wallet submitted ${recorded.submitTxHash} on chain. Nothing was staged, and no second delivery can be submitted — the escrow accepts one. Do not redo the work.`,
    };
  }
  return recorded.contentSha256 === askedSha256
    ? {
        action: 'reuse',
        message:
          'These exact bytes were already staged for this job and are still waiting for the provider wallet’s signature. The staged work is unchanged; nothing new was written and nothing has been delivered.',
      }
    : {
        action: 'restage',
        message:
          'A different deliverable was already staged for this job and had not been signed, so it was replaced rather than added to. One job has one delivery.',
      };
}

/**
 * Why a funded job cannot be delivered through this path, or null.
 *
 * Read from the status Pokter's index holds, which is itself read back from
 * chain before it is kept. It is a first answer and not the last one: the
 * delivery route re-reads the escrow when the provider signs, because the
 * index can be a sweep behind. Staging against a job that has moved on is
 * a waste of the provider's work, so it is refused here too.
 */
export function deliveryBlocked(job: { status: string; expiredAt: string }, now: number = Date.now()): string | null {
  if (job.status === 'SUBMITTED') {
    return 'This job has already been delivered and is in its review window. Delivering again is impossible: the escrow accepts one submission.';
  }
  if (job.status === 'COMPLETED') return 'This job is settled and paid. There is nothing left to deliver.';
  if (job.status === 'REJECTED') return 'This delivery was disputed and the voters rejected it. The escrow refunded the buyer and will not take another submission.';
  if (job.status === 'EXPIRED') return 'This job expired and the buyer reclaimed the escrow. Nothing delivered now would be paid.';
  if (job.status !== 'FUNDED') return `This job is ${job.status}, not FUNDED, so no delivery can be submitted for it.`;
  const deadline = Date.parse(job.expiredAt);
  if (Number.isFinite(deadline) && deadline <= now) {
    return 'This job is past its delivery deadline. The escrow refuses a late submission, so staging work for it would waste it.';
  }
  return null;
}
