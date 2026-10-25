import 'server-only';

import { isLifecycleDemo, isRelayedDelivery } from '@/lib/agent/credited-history';
import { teamAddressSet } from '@/lib/team/wallets';
import type { HiredJob } from '@/lib/erc8183/types';

/**
 * The delivery half of the Pokter Score, counted off the jobs themselves.
 *
 * `agentHistory` already classifies this marketplace's jobs carefully, and
 * this uses the same rules rather than inventing a second set — but it
 * applies one more exclusion that the economic history deliberately does
 * not: self-hires are dropped from the record entirely.
 *
 * The history keeps them because they are a fact about the agent worth
 * reporting; a ranked score cannot, because an operator can fund their own
 * agent as often as they like. The model's own limits say plainly that this
 * only stops the obvious case: Pokter cannot prove two wallets are
 * unrelated, so the same operator funding from a second wallet is not
 * detected here and is not claimed to be.
 *
 * Lifecycle demonstrations are dropped for the opposite reason: Pokter's
 * seller closed them with a receipt and no answer from the agent, so they
 * are evidence about the escrow and about nothing else.
 *
 * A delivery counts only when the agent submitted it. One Pokter's courier
 * carried says the buyer was served; it does not say this agent can deliver,
 * and crediting it would be the substitution Pokter refuses in anyone
 * else's figures.
 */
export interface DeliveryRecord {
  delivered: number;
  missed: number;
  /** Funded, inside its deadline, and so neither delivered nor missed. */
  pending: number;
  /** Dropped before counting, and said out loud on the agent's page. */
  excluded: { selfHire: number; lifecycleDemo: number; courierDelivered: number };
}

export function deliveryRecord(jobs: readonly HiredJob[], now = Date.now()): DeliveryRecord {
  const team = teamAddressSet();
  const isSelfHire = (job: HiredJob) =>
    Boolean(job.client) && job.client!.toLowerCase() === String(job.provider ?? '').toLowerCase();

  const selfHire = jobs.filter(isSelfHire).length;
  const lifecycleDemo = jobs.filter((job) => !isSelfHire(job) && isLifecycleDemo(job)).length;

  const counted = jobs.filter((job) => !isSelfHire(job) && !isLifecycleDemo(job));
  /* Pokter's own wallet as the provider is Pokter's record, not the
     agent's — the same split `economic-history` makes. */
  const byOperator = (job: HiredJob) => team.has(String(job.provider ?? '').toLowerCase());
  const mine = counted.filter((job) => !byOperator(job));

  const submitted = mine.filter((job) => ['SUBMITTED', 'COMPLETED'].includes(job.status));
  const courierDelivered = submitted.filter(isRelayedDelivery).length;

  /*
   * Past its deadline and undelivered. A funded job still inside its window
   * is pending and reaches neither number: counting it as a failure would
   * mark an agent down for work it still has time to do.
   */
  const lapsed = (job: HiredJob) => job.status === 'FUNDED' && Date.parse(job.expiredAt) <= now;

  return {
    delivered: submitted.filter((job) => !isRelayedDelivery(job)).length,
    missed: mine.filter((job) => job.status === 'EXPIRED' || lapsed(job)).length,
    pending: mine.filter((job) => job.status === 'FUNDED' && !lapsed(job)).length,
    excluded: { selfHire, lifecycleDemo, courierDelivered },
  };
}
