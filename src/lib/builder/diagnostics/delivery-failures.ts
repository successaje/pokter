import { sanitiseFailureReason } from '@/lib/erc8183/delivery-diagnostics';
import type { HiredJob } from '@/lib/erc8183/types';
import { WITHHELD_REASON_TEXT } from './withheld';
import type { DeliveryFailure } from './report';

/**
 * Funded jobs that ended badly, as a list a builder can act on.
 *
 * `summariseEconomicHistory` already counts these; it does not say which
 * jobs they were, and "1 missed" with no job id is not something anybody
 * can go and look at. The classification here follows that file exactly,
 * including the two exclusions it makes and why:
 *
 *  - A **lifecycle demonstration** is a job Pokter's own seller closed with
 *    a receipt and no answer from the agent. It is neither a delivery nor a
 *    miss, so it is neither here.
 *  - A job whose **provider is a declared Pokter wallet** was Pokter's to
 *    deliver. On 17 October 2026, 9 of 24 expired jobs had a Pokter wallet
 *    as provider, and agents were carrying misses for deliveries they were
 *    never named in. Those belong on Pokter's record, not the builder's.
 *
 * Team-funded jobs are **not** excluded, unlike every demand figure. A
 * funded job the agent let lapse is a fact about the agent whoever paid for
 * it — the rule `team/wallets.ts` states — and a builder who only ever sees
 * misses on outside jobs is being hidden from the ones Pokter found first.
 *
 * `status === 'FUNDED'` past its deadline counts as lapsed as well as
 * `EXPIRED`: the contract only marks a job EXPIRED once its escrow is
 * reclaimed, so a missed job nobody reclaimed still reads FUNDED.
 */
export function deliveryFailuresFrom(input: {
  jobs: readonly HiredJob[];
  now: number;
  isLifecycleDemo: (job: HiredJob) => boolean;
  /** Lower-cased team wallet addresses, from `teamWalletSet()`. */
  teamWallets: ReadonlySet<string>;
  /** The seller's answer when told the job was funded, if it gave one. */
  noticeFor: (job: HiredJob) => { status: string; reason: string | null; lastAt: string } | null;
  limit?: number;
}): DeliveryFailure[] {
  const owedByPokter = (job: HiredJob) => {
    const provider = typeof job.provider === 'string' ? job.provider.toLowerCase() : null;
    return provider !== null && input.teamWallets.has(provider);
  };

  const failures: DeliveryFailure[] = [];
  for (const job of input.jobs) {
    if (job.status === 'OPEN') continue;
    if (input.isLifecycleDemo(job)) continue;
    if (owedByPokter(job)) continue;

    const notice = input.noticeFor(job);
    const refused = notice?.status === 'rejected' && ['FUNDED', 'EXPIRED'].includes(job.status);
    const escrowChainId = job.chainId;

    if (refused) {
      /*
       * The seller's own words, through the hardened sanitiser rather than
       * a second one written here. A reason it will not bound comes back
       * null, and null is shown as withheld instead of as "it gave no
       * reason" — those are different facts and only one of them is the
       * agent's fault.
       */
      const safe = notice?.reason ? sanitiseFailureReason(notice.reason) : null;
      failures.push({
        jobId: job.jobId,
        escrowChainId,
        kind: 'refused-funded-job',
        at: notice?.lastAt ?? job.statusCheckedAt,
        sellerReason: notice?.reason ? (safe === null ? WITHHELD_REASON_TEXT : safe || null) : null,
      });
      continue;
    }

    if (job.status === 'REJECTED') {
      failures.push({ jobId: job.jobId, escrowChainId, kind: 'disputed', at: job.statusCheckedAt, sellerReason: null });
      continue;
    }

    const lapsed = job.status === 'EXPIRED' || (job.status === 'FUNDED' && Date.parse(job.expiredAt) <= input.now);
    if (lapsed) {
      failures.push({ jobId: job.jobId, escrowChainId, kind: 'lapsed', at: job.expiredAt, sellerReason: null });
    }
  }

  failures.sort((a, b) => b.at.localeCompare(a.at));
  return input.limit === undefined ? failures : failures.slice(0, input.limit);
}
