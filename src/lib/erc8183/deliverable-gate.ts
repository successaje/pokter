import { manifestMatch } from './manifest-match';

/**
 * Whether a stored deliverable may be served publicly yet.
 *
 * Prepared work is written before the submit transaction, so it is served
 * only once it is a delivery: the submit transaction was recorded, or the
 * job on chain commits to exactly these bytes, in any form Pokter accepts
 * as the agent's commitment. A chain that cannot be read is its own answer,
 * never a delivery and never "not delivered". The chain read is passed in,
 * so the rule is tested without a network.
 */
export type DeliverableGate = { serve: true; readChain: boolean } | { serve: false; status: 404 | 503; reason: string };

const NONE = /^0x0{64}$/;

export async function deliverableGate(
  stored: { manifestText: string; submitTxHash: string | null },
  readCommitted: () => Promise<unknown>,
): Promise<DeliverableGate> {
  if (stored.submitTxHash) return { serve: true, readChain: false };
  let committed: unknown;
  try {
    committed = await readCommitted();
  } catch {
    return { serve: false, status: 503, reason: 'Pokter could not read this job from chain just now, so it cannot say whether this deliverable was submitted. Try again shortly.' };
  }
  if (typeof committed !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(committed) || NONE.test(committed) || manifestMatch(stored.manifestText, committed) === null) {
    return { serve: false, status: 404, reason: 'Not delivered yet: nothing submitted on chain for this job matches this deliverable.' };
  }
  return { serve: true, readChain: true };
}
