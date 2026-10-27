import 'server-only';

import type { Hex } from 'viem';

import { storedDeliveryText } from '@/lib/erc8183/deliverable-gate';
import { deliverableKey, readDeliverable } from '@/lib/erc8183/deliverables';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { findDeliverable } from '@/lib/erc8183/deliverable-url';
import { historyClient } from '@/lib/erc8183/history-client';
import { fetchDeliverableText } from '@/lib/erc8183/fetch-deliverable';
import { getJobStore } from '@/lib/erc8183/store';

/**
 * The bytes a delivered job committed to, read the one way Pokter reads
 * them: its own stored copy when that is what was delivered, else the link
 * the index holds, else the submit event found near its own block — within
 * a bound, because a slow chain read must not hang a page.
 *
 * Moved here from the job page's answer route so the public evidence page
 * reads a delivery exactly as the buyer's page does, failures included.
 * Three outcomes, not two: a chain read that errors and one that runs out
 * of time both used to arrive as "no url" and were reported as the agent
 * having published nothing — Pokter's own failure, stated as a fact about
 * somebody else's agent.
 */
export type DeliveryRead = { ok: true; text: string } | { ok: false; reason: string };

export async function readDeliveryText(chainId: 56 | 97, jobId: string, onchain: { deliverable: Hex; submittedAt: bigint }, lookupTimeoutMs = 12_000): Promise<DeliveryRead> {
  /* The stored copy only when it is what was delivered; a draft never stands in for it. */
  const stored = storedDeliveryText(readDeliverable(deliverableKey(chainId, jobId)), onchain.deliverable);
  if (stored) return { ok: true, text: stored };
  const indexed = getJobStore().all().find((j) => j.chainId === chainId && j.jobId === jobId);
  type Lookup = { url: string } | { url: null; whose: 'ours' | 'theirs' | 'unfound' };
  const lookup: Lookup = indexed?.deliverableUrl
    ? { url: indexed.deliverableUrl }
    : await Promise.race([
        findDeliverable(historyClient(chainId), correctedErc8183Addresses(chainId).policy, BigInt(jobId), onchain.submittedAt)
          .then((found): Lookup => (found.url ? { url: found.url } : { url: null, whose: found.event ? 'theirs' : 'unfound' }))
          .catch((): Lookup => ({ url: null, whose: 'ours' })),
        new Promise<Lookup>((resolve) => setTimeout(() => resolve({ url: null, whose: 'ours' }), lookupTimeoutMs)),
      ]);
  if (!lookup.url) {
    return {
      ok: false,
      reason:
        'whose' in lookup && lookup.whose === 'ours'
          ? 'We could not retrieve the delivery link just now. The agent may well have published one; this check timed out or the chain read failed.'
          : 'whose' in lookup && lookup.whose === 'unfound'
            ? 'We could not find the delivery on chain just now, so its link could not be read. That is usually the node we read from not reaching that far back, not the agent.'
            : 'The agent published no readable link for its delivery.',
    };
  }
  const text = await fetchDeliverableText(lookup.url).catch(() => null);
  return text ? { ok: true, text } : { ok: false, reason: 'The delivery link could not be read just now.' };
}
