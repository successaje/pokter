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

/**
 * The stored copy a reader may use in place of the delivered one: only when
 * it is the delivery. A builder can prepare one draft and submit different
 * bytes; read first, the stale draft would be shown and checked as if it
 * were the answer. Without a recorded submit, the copy must match the hash
 * the job committed on chain; otherwise the caller reads the committed URL.
 */
export function storedDeliveryText(stored: { manifestText: string; submitTxHash: string | null } | null, committed: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.submitTxHash) return stored.manifestText;
  if (typeof committed !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(committed) || NONE.test(committed)) return null;
  return manifestMatch(stored.manifestText, committed) === null ? null : stored.manifestText;
}
