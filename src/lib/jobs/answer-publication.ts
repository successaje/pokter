import type { JobFunder } from './evidence-view';

/**
 * Whether Pokter shows a delivered answer on its public pages.
 *
 * Every delivered job's evidence page, and every agent page's sample,
 * showed the agent's answer whoever paid for it, and the sitemap offered
 * those pages to search engines. The brief was withheld and the buyer's
 * wallet masked, but an answer can carry the task in it: a report on "the
 * account you asked about" describes somebody's own position.
 *
 * So the answer is shown for Pokter's own test jobs and for an operator
 * hiring their own agent, whose work it is either way, and for any other
 * job only once the wallet that funded it chooses to publish it. Status,
 * token, amount and the hash check stay public on every job: that the
 * work was delivered is the agent's record, and hiding it would hide the
 * agent's real jobs.
 *
 * This decides what Pokter publishes, not what is secret. The agent
 * publishes its delivery at a link recorded on chain, which anyone can
 * read; the hire page says so before anything is funded.
 */
export interface PublicationDecision {
  published: boolean;
  /** When the funding wallet signed it, as written in the signed message. */
  decidedAt: string;
}

export function answerIsPublic(funder: JobFunder, decision: PublicationDecision | null): boolean {
  if (funder === 'team' || funder === 'self') return true;
  return decision?.published === true;
}

/** A signed decision older than this is refused, so a captured signature cannot be replayed later. */
export const DECISION_MAX_AGE_MS = 10 * 60_000;
/** Clock skew allowed for a decision dated slightly ahead of the server. */
export const DECISION_FUTURE_SKEW_MS = 2 * 60_000;

/**
 * The exact words the funding wallet signs. Built the same way on both
 * sides: the page asks the wallet to sign this, and the server rebuilds it
 * from the request to check the signature, so neither can be talked into
 * a different meaning.
 */
export function publicationMessage(input: { chainId: number; jobId: string; publish: boolean; decidedAt: string }): string {
  const network = input.chainId === 56 ? 'BNB Chain' : input.chainId === 97 ? 'BNB Testnet' : `chain ${input.chainId}`;
  const what = input.publish
    ? `Pokter may show the answer delivered for job #${input.jobId} on ${network} on its public pages: the job's evidence page, and the agent's page as a sample.`
    : `Pokter must stop showing the answer delivered for job #${input.jobId} on ${network} on its public pages.`;
  return `${what}\n\nThis changes only what Pokter shows. It moves no funds and grants nothing else.\n\nDecided at: ${input.decidedAt}`;
}

/** Whether a decision's time is fresh enough to accept now. */
export function decisionIsFresh(decidedAt: string, now = Date.now()): boolean {
  const at = Date.parse(decidedAt);
  if (!Number.isFinite(at) || new Date(at).toISOString() !== decidedAt) return false;
  return now - at <= DECISION_MAX_AGE_MS && at - now <= DECISION_FUTURE_SKEW_MS;
}
