import { createHash } from 'node:crypto';

import { canonicalJson } from '@/lib/erc8183/negotiation';
import { describeFundingOutcome, retrySafe, type FundingOutcome } from '@/lib/hire/funding-outcome';

/**
 * One purchase, however many times it is asked for.
 *
 * A human hiring an agent clicks once and watches. An assistant retries: on
 * a timeout, on a dropped connection, on its own restart, and sometimes
 * because the caller above it asked the same question twice. Nothing in the
 * hire flow was built for that. The browser path has one defence and it is
 * the right one — `funding-outcome` reads the chain when the wallet stops
 * reporting, because "a retry after a funding that had in fact landed
 * creates a second job and pays twice" — but it only covers the moment of
 * signing. A tool chain needs the same guarantee from the first call.
 *
 * So a prepared request has a key, and the key is what the owner is buying
 * rather than what Pokter happened to compute:
 *
 *  - The agent, the escrow chain, the escrow contract, the provider, the
 *    token, the owner and the exact task. Change any of them and it is a
 *    different purchase.
 *  - **The owner**, because a purchase is somebody's. The fields above
 *    identify work, and two owners can send one brief byte for byte —
 *    `briefAcceptable` admits an agent's own published examples, and a
 *    compiled payload is deterministic, so this is ordinary rather than
 *    exotic. Without the owner in the key, the second of them was handed
 *    the first one's job: a job they cannot release, dispute or read, and a
 *    hire they could never prepare. An owner Pokter has not been told is
 *    its own key, and learning who they are mid-flow therefore makes a
 *    second one. That is the safe direction: a prepared request is
 *    unsigned, so the cost is a duplicate prompt, where being handed
 *    somebody else's job is the worse failure by a long way.
 *  - **Not** the negotiation hash. A quote expires in minutes, so a retry
 *    normally carries a fresh signature over identical terms. Keying on the
 *    hash would make every re-quote a new purchase, which is exactly the
 *    second job this exists to prevent.
 *  - **Not** the price, for the same reason and it is the sharper case: a
 *    retry has to ask the agent again, and the agent may answer with a
 *    different number. Keying on the amount would then produce a new key,
 *    miss the request already recorded, and offer a second hire of work
 *    that may already be funded. The price is still bounded by the owner's
 *    ceiling and restated in full in every response — it is a term of the
 *    offer, not the identity of the purchase.
 *  - **Not** the time. Two calls a minute apart for the same thing are one
 *    purchase.
 *
 * A caller that genuinely wants to buy the same work twice says so by
 * passing its own `mandateKey`, which is mixed in: two deliberate hires are
 * two keys, and a retry is never one of them by accident.
 */

export interface HireRequestTerms {
  agentChainId: number;
  agentTokenId: string;
  /** The escrow chain, as the owner stated it. */
  chainId: number;
  escrow: string;
  provider: string;
  token: string;
  /** The wallet expected to approve it, where the owner said. */
  owner?: string | null;
  task: string;
}

/**
 * The key for these terms.
 *
 * Over `canonicalJson` so key order cannot change the key, and over
 * lower-cased addresses so a checksummed and an unchecksummed spelling of
 * the same wallet are the same purchase.
 */
export function hireRequestKey(terms: HireRequestTerms, mandateKey?: string | null): string {
  const material = {
    agent: `${terms.agentChainId}/${terms.agentTokenId}`,
    chainId: terms.chainId,
    escrow: terms.escrow.toLowerCase(),
    provider: terms.provider.toLowerCase(),
    token: terms.token.toLowerCase(),
    owner: terms.owner ? terms.owner.toLowerCase() : null,
    task: terms.task,
    /* Absent and empty are the same thing: a caller that sends no key, and
       one that sends "", are both asking for the terms-derived key. */
    mandateKey: mandateKey ? mandateKey.slice(0, 64) : null,
  };
  return `phr_${createHash('sha256').update(canonicalJson(material)).digest('hex').slice(0, 32)}`;
}

/**
 * What to do with a request that has been asked for before.
 *
 * `prepare` and `reuse` both hand the owner an unsigned request; the
 * difference is whether one was already recorded under this key, and
 * `reuse` must return that one rather than a second. `adopt` is the state
 * that makes the whole thing idempotent: a job exists for this key, so no
 * further request is prepared for it, ever.
 */
export type HireRetry =
  | { action: 'prepare'; message: string }
  | { action: 'reuse'; message: string }
  | { action: 'adopt'; jobId: string; chainId: number; message: string }
  | { action: 'reconcile'; message: string }
  | { action: 'stop'; message: string };

/**
 * Whether this decision hands the owner a request to approve.
 *
 * The guard that stops one purchase becoming two payments, as a function
 * rather than a condition written out at the call site. It was the latter,
 * and a mutation narrowing it from "adopt, stop or reconcile" to "adopt"
 * alone passed the whole suite — the three outcomes that must prepare
 * nothing were held together by a boolean expression no test could reach.
 * Here they are one answer, and wrong is a failing test.
 *
 * `adopt` already has a job. `stop` is a payment nobody can account for,
 * where offering a fresh request is how somebody pays twice. `reconcile`
 * has not asked the chain yet, and absence of a record is not evidence
 * that nothing was funded.
 */
export function handsOverRequest(action: HireRetry['action']): boolean {
  return action === 'prepare' || action === 'reuse';
}

/**
 * Decided from what is recorded, what is on chain, and nothing else.
 *
 * The uncertain case comes first on purpose. A caller that says "I may have
 * sent this" is answered by the chain before anything else happens, through
 * the same `fundingOutcome` the browser path reads — `taken` and `mismatch`
 * are not retried, because neither establishes that the money stayed put.
 * Absence of a record is not evidence that nothing was funded either, which
 * is why `reconcile` exists rather than falling through to `prepare`.
 */
export function retryDecision(input: {
  /** The row already held for this key, if any. */
  recorded: { jobId: string | null; chainId: number } | null;
  /** A job in Pokter's own index whose terms are this request's, if any. */
  indexed: { jobId: string; chainId: number } | null;
  /**
   * A transaction the caller cannot account for, already read back from the
   * escrow through `fundingOutcome`. Given without an outcome, the answer
   * is to go and read it.
   */
  uncertain?: { jobId: string; outcome: FundingOutcome | null } | null;
}): HireRetry {
  const uncertain = input.uncertain;
  if (uncertain) {
    if (uncertain.outcome === null) {
      return {
        action: 'reconcile',
        message: `Job ${uncertain.jobId} was named as possibly funded by this request but has not been read back from the escrow. Read it first: resubmitting before that is how a caller pays twice.`,
      };
    }
    if (uncertain.outcome === 'funded') {
      return {
        action: 'adopt',
        jobId: uncertain.jobId,
        chainId: input.recorded?.chainId ?? 0,
        message: `${describeFundingOutcome('funded')} It is job ${uncertain.jobId}; track that rather than preparing anything further.`,
      };
    }
    if (!retrySafe(uncertain.outcome)) {
      return { action: 'stop', message: describeFundingOutcome(uncertain.outcome) };
    }
    /* `not-funded`: the id the attempt predicted holds nothing, so the money
       did not move and the same prepared request can be handed over again. */
    return {
      action: input.recorded ? 'reuse' : 'prepare',
      message: `${describeFundingOutcome('not-funded')} The same unsigned request stands; it still needs the owner’s approval.`,
    };
  }

  const funded = input.recorded?.jobId
    ? { jobId: input.recorded.jobId, chainId: input.recorded.chainId }
    : input.indexed;
  if (funded) {
    return {
      action: 'adopt',
      jobId: funded.jobId,
      chainId: funded.chainId,
      message: `This request was already funded as job ${funded.jobId} on chain ${funded.chainId}. Nothing further was prepared: a second request for the same terms would be a second job and a second payment. Track job ${funded.jobId}.`,
    };
  }
  if (input.recorded) {
    return {
      action: 'reuse',
      /* The same purchase, under the same key, and not necessarily at the
         same price: the amount is not part of the key, so a re-quote is
         answered here. The response says what it was first priced at. */
      message:
        'This purchase was prepared before and is still waiting for the owner’s approval. It is returned under the same key, re-priced if the agent answered differently — check the amount against what the owner was told.',
    };
  }
  return { action: 'prepare', message: 'No request has been prepared for these terms yet.' };
}

/**
 * The job in Pokter's index that is this request's, if one is.
 *
 * The index is how a prepared request finds out it has already been funded
 * when the owner approved it somewhere this process never saw — another
 * device, another session, a tab that was closed. Matched on the fields
 * that identify the purchase and on nothing else: an agent, a provider and
 * the exact brief.
 *
 * Not matched on amount, for the reason the key is not: the price is what
 * the agent asked at one moment, and a retry can be answered with another.
 * A job for this agent, this provider and this exact brief is this
 * purchase, whatever it was finally funded at — and the amount it was
 * actually funded at is on chain for the owner to read.
 *
 * Matched on the funding wallet when both are known, because the index is
 * everybody's. `byAgent` returns every job ever funded for an agent, by any
 * buyer, and the fields above identify work rather than a buyer: an agent's
 * own published example brief, or one owner's question about a public
 * protocol address, is a brief two owners can send byte for byte. Without
 * this, the second owner is told their hire "was already funded as job N"
 * — somebody else's job, which they cannot release, dispute or read — and
 * can never prepare that hire at all. A row indexed before `client` was
 * kept has none, and an owner that did not say who they are cannot be
 * compared with: both still match on the work, as before.
 */
export function indexedJobForTerms(
  jobs: readonly {
    jobId: string;
    chainId: number;
    agentChainId?: number;
    agentTokenId: string;
    provider: string;
    task: string;
    /** The wallet that funded it, where the index kept one. */
    client?: string | null;
  }[],
  terms: HireRequestTerms,
  /** The owner this request would be prepared for, where they said. */
  owner?: string | null,
): { jobId: string; chainId: number } | null {
  const found = jobs.find(
    (job) =>
      job.chainId === terms.chainId &&
      (job.agentChainId ?? 56) === terms.agentChainId &&
      job.agentTokenId === terms.agentTokenId &&
      job.provider.toLowerCase() === terms.provider.toLowerCase() &&
      job.task === terms.task &&
      (!owner || !job.client || job.client.toLowerCase() === owner.toLowerCase()),
  );
  return found ? { jobId: found.jobId, chainId: found.chainId } : null;
}
