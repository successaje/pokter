import 'server-only';

import { getErc8183Job } from '@altananetwork/sdk';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { isDemoSeller, submitDemoDeliverable } from '@/lib/erc8183/demo-seller';
import { getJobStore } from '@/lib/erc8183/store';
import { shouldRetryDelivery } from '@/lib/erc8183/delivery-eligibility';

/**
 * Deliver the jobs whose notification never arrived.
 *
 * `/api/notify-funded` was called from exactly one place: the hire panel, in
 * the browser, once, immediately after funding. Nothing retried it. So a
 * closed tab, a network blip or a seller that happened to be restarting left
 * the escrow funded, the seller never told the job existed, and the money
 * sitting there until it expired.
 *
 * The evidence was in the jobs themselves. Our own seller delivered #1366,
 * #1368 and #1375 and failed on #1364, #1365 and #1372 — the same seller,
 * capable of the work, succeeding or failing on whether one client-side
 * fetch landed. Delivery was a coin flip.
 *
 * This rides the sweep, which already runs on a schedule and already reads
 * every job from chain to reconcile it. Having read that a job is funded and
 * undelivered, the cheapest honest thing to do is try again.
 */

/**
 * How many to attempt per run.
 *
 * Each delivery writes on chain and takes seconds. A backlog should drain
 * over several sweeps rather than turn one cron into a timeout that reports
 * nothing and leaves the rest untried.
 */
const MAX_PER_RUN = 3;

export interface DeliveryRetryOutcome {
  jobId: string;
  action: 'delivered' | 'failed' | 'skipped';
  reason?: string;
}

export async function retryStuckDeliveries(): Promise<DeliveryRetryOutcome[]> {
  const candidates = getJobStore()
    .all()
    .filter(
      (job) => job.chainId === ALTANA_NETWORK.chainId && job.status === 'FUNDED',
    );

  const results: DeliveryRetryOutcome[] = [];

  for (const job of candidates) {
    if (results.filter((r) => r.action !== 'skipped').length >= MAX_PER_RUN) break;

    try {
      /*
       * Re-read from chain rather than trusting the index. The index is
       * refreshed by this same sweep and could be a moment stale, and the
       * thing about to happen writes a transaction.
       */
      const onchain = await getErc8183Job(ALTANA_NETWORK, BigInt(job.jobId));

      const decision = shouldRetryDelivery(
        {
          statusName: onchain.statusName,
          expiredAtMs: Number(onchain.expiredAt) * 1000,
          providerIsOurSeller: await isDemoSeller(onchain.provider),
        },
        Date.now(),
      );
      if (!decision.retry) {
        results.push({
          jobId: job.jobId,
          action: 'skipped',
          reason: decision.reason,
        });
        continue;
      }

      await submitDemoDeliverable(job.jobId);
      results.push({ jobId: job.jobId, action: 'delivered' });
    } catch (error) {
      /*
       * A failure here is reported and left for the next sweep. The job is
       * still funded and still in range; nothing has been lost by trying.
       */
      results.push({
        jobId: job.jobId,
        action: 'failed',
        reason: (error as Error).message.slice(0, 120),
      });
    }
  }

  return results;
}
