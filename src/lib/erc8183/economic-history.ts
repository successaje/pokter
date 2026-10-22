import { uniformOfferedDecimals } from '@/lib/network/tokens';
import { formatUnits } from 'viem';

import type { HiredJob } from './types';
import { fundedByTeam, teamAddressSet } from '@/lib/team/wallets';

export interface OutsideTeamHistory {
  jobs: number;
  completed: number;
  terminal: number;
  uniqueBuyers: number;
  completionRate: number | null;
}

export interface AgentEconomicHistory {
  jobs: number;
  delivered: number;
  /**
   * Deliveries submitted by a wallet Pokter does not operate, which is the
   * only kind that says anything about the agent.
   *
   * The buyer side of this record has always excluded Pokter's own wallets;
   * the seller side did not, so a job Pokter delivered on an agent's behalf
   * earned that agent a "Delivered" milestone. The LP Rebalancer's single
   * delivery was submitted by a retired Pokter operator, and the ladder
   * credited the agent for it. That is the same substitution Pokter declines
   * to accept in anyone else's figures.
   */
  selfDelivered: number;
  /** Deliveries a declared Pokter wallet submitted. Kept, and labelled. */
  operatorDelivered: number;
  /**
   * Of those, the ones whose manifest carries this agent's own answer:
   * Pokter's courier submitted the transaction, the agent produced what it
   * submitted.
   *
   * The provider address alone cannot tell these apart from a Pokter wallet
   * standing in for an agent that did nothing, because the courier submits
   * from a Pokter wallet either way. The manifest can, and already does:
   * it names the endpoint and skill the answer came from and the agent it
   * belongs to. Job 97/1585 is the case — Pokter Evidence answered over
   * A2A, the courier submitted the manifest, the escrow completed — and
   * reporting it only as `operatorDelivered` said a delivery had reached
   * escrow without saying whose answer was in it.
   *
   * A subset of `operatorDelivered` rather than a count of its own, so it
   * refines the existing split instead of redrawing it. The two are the
   * same set today: a relayed manifest means the courier submitted, and
   * the courier signs with the operator key, which is declared.
   */
  relayedDelivered: number;
  completed: number;
  rejected: number;
  expired: number;
  /**
   * Funded jobs the agent let lapse: EXPIRED, or still FUNDED after the
   * deadline. The contract only marks a job EXPIRED once its escrow is
   * reclaimed, so a missed job nobody reclaimed still reads FUNDED, and
   * counting EXPIRED alone would understate misses.
   *
   * Excludes jobs a Pokter wallet was the provider for, for the same
   * reason `selfDelivered` does: those are Pokter's own deliveries. The
   * credit side was fixed and this side was not, so Pokter withheld
   * credit for a trial it delivered and assigned blame for one it failed
   * to deliver. On 17 October 2026, 9 of 24 expired jobs had a Pokter
   * wallet as provider, and four agents carried a miss for a delivery
   * they were never named in — Hevo Rebalance's whole "missed 1 of 1"
   * was job 97/1446, whose provider is the operator key.
   */
  missed: number;
  /** Misses on jobs a declared Pokter wallet owed. Kept, and labelled. */
  operatorMissed: number;
  /** Funded and still inside the delivery window: not yet a pass or a miss. */
  pending: number;
  unresolved: number;
  totalFundedU: string;
  latestCheckedAt: string | null;
  recent: HiredJob[];
  /** Distinct known funding wallets across all indexed jobs. */
  uniqueBuyers: number;
  /** Demand not funded by a declared Pokter wallet. This is not called independent. */
  outsideTeam: OutsideTeamHistory;
  /**
   * Jobs whose buyer and seller are the same wallet.
   *
   * An operator funding their own agent is not demand, whoever they are.
   * Three testnet jobs on one agent were counted as outside demand on this
   * basis alone, and anyone could see it with the public receipt index and
   * one `eth_call` — which is exactly what Pokter invites people to do. They
   * are excluded from `outsideTeam` and reported here instead.
   */
  selfHire: number;
  /**
   * Jobs Pokter's seller closed with a receipt and no answer from the agent:
   * lifecycle demonstrations. They prove the escrow works and say nothing
   * about the agent, so none of the figures above count them, as a delivery
   * or as a miss.
   */
  lifecycleDemos: number;
  /**
   * Jobs the seller refused, with its reason, when told they were funded.
   *
   * Not counted as missed. A miss is a job left to lapse in silence; a
   * refusal is an answer, and the one that started this count was Pokter's
   * fault: Sluicegate refused a job because Pokter had left its signed quote
   * out of the description, and would otherwise have been marked as an
   * agent that lets paid jobs lapse. Reported, so a seller that refuses
   * everything is still visible as one.
   */
  refused: number;
}

/**
 * Summarise only jobs Pokter has indexed and attributed to an ERC-8004
 * identity. This is deliberately not described as chain-wide activity: the
 * commerce contract does not carry the agent token id, so attribution depends
 * on Pokter's immutable job envelope and index.
 */
export function summariseEconomicHistory(
  jobs: HiredJob[],
  now = Date.now(),
  {
    isLifecycleDemo,
    isRelayedDelivery,
    refusedAtNotice,
  }: {
    isLifecycleDemo?: (job: HiredJob) => boolean;
    isRelayedDelivery?: (job: HiredJob) => boolean;
    refusedAtNotice?: (job: HiredJob) => boolean;
  } = {},
): AgentEconomicHistory {
  // Entry into this store is itself chain-verified. Some relayed/batched hires
  // do not expose a transaction hash to the SDK even though the kernel reads
  // FUNDED, so requiring a hash here would silently erase valid paid work.
  const demos = isLifecycleDemo ? jobs.filter((job) => job.status !== 'OPEN' && isLifecycleDemo(job)) : [];
  const funded = jobs.filter((job) => job.status !== 'OPEN' && !demos.includes(job));
  const total = funded.reduce((sum, job) => sum + BigInt(job.budgetRaw), 0n);
  // Only an undelivered job can have been refused; a later delivery outranks the refusal.
  const refused = (job: HiredJob) =>
    Boolean(refusedAtNotice) && ['FUNDED', 'EXPIRED'].includes(job.status) && refusedAtNotice!(job);
  const lapsed = (job: HiredJob) => job.status === 'FUNDED' && Date.parse(job.expiredAt) <= now && !refused(job);
  const team = teamAddressSet();
  const selfHire = (job: HiredJob) =>
    Boolean(job.client) && job.client!.toLowerCase() === String(job.provider ?? '').toLowerCase();
  const outside = funded.filter((job) => !fundedByTeam(job, team) && !selfHire(job));
  const outsideCompleted = outside.filter((job) => job.status === 'COMPLETED').length;
  const outsideTerminal = outside.filter((job) => ['COMPLETED', 'REJECTED', 'EXPIRED'].includes(job.status) && !refused(job)).length;
  const outsideBuyers = new Set(outside.flatMap((job) => job.client ? [job.client.toLowerCase()] : []));
  const buyers = new Set(funded.flatMap((job) => job.client ? [job.client.toLowerCase()] : []));
  const deliveries = funded.filter((job) => ['SUBMITTED', 'COMPLETED'].includes(job.status));
  /*
   * A row with no provider is not evidence either way, so it is counted as
   * neither: `selfDelivered` and `operatorDelivered` can sum to less than
   * `delivered`, which is the honest shape when the submitter is unknown.
   */
  const provider = (job: HiredJob) => typeof job.provider === 'string' ? job.provider.toLowerCase() : null;
  const byOperator = (job: HiredJob) => { const p = provider(job); return p !== null && team.has(p); };
  const bySelf = (job: HiredJob) => { const p = provider(job); return p !== null && !team.has(p); };

  return {
    jobs: funded.length,
    delivered: deliveries.length,
    selfDelivered: deliveries.filter(bySelf).length,
    operatorDelivered: deliveries.filter(byOperator).length,
    relayedDelivered: isRelayedDelivery
      ? deliveries.filter((job) => byOperator(job) && isRelayedDelivery(job)).length
      : 0,
    completed: funded.filter((job) => job.status === 'COMPLETED').length,
    rejected: funded.filter((job) => job.status === 'REJECTED').length,
    expired: funded.filter((job) => job.status === 'EXPIRED').length,
    /*
     * Split by who owed the delivery, not just by what happened. Neither
     * number is hidden: one is the agent's record, the other is Pokter's.
     */
    missed: funded.filter((job) => !byOperator(job) && ((job.status === 'EXPIRED' && !refused(job)) || lapsed(job))).length,
    operatorMissed: funded.filter((job) => byOperator(job) && ((job.status === 'EXPIRED' && !refused(job)) || lapsed(job))).length,
    pending: funded.filter((job) => job.status === 'FUNDED' && !lapsed(job) && !refused(job)).length,
    refused: funded.filter(refused).length,
    unresolved: funded.filter((job) =>
      ['FUNDED', 'SUBMITTED'].includes(job.status),
    ).length,
    /*
     * Summed across jobs that do not record their token.
     *
     * `uniformOfferedDecimals` throws if the offered tokens ever stop sharing
     * a scale, so this cannot quietly become wrong. It is still a total
     * across chains when the caller passes jobs from both, and mainnet $U and
     * testnet $U are different tokens — one real, one not. Scoping that needs
     * a chain filter here or a token on the job row, both of which change a
     * published shape.
     */
    totalFundedU: formatUnits(total, uniformOfferedDecimals()),
    latestCheckedAt:
      funded
        .map((job) => job.statusCheckedAt)
        .sort((a, b) => b.localeCompare(a))[0] ?? null,
    recent: funded.slice(0, 3),
    uniqueBuyers: buyers.size,
    selfHire: funded.filter(selfHire).length,
    lifecycleDemos: demos.length,
    outsideTeam: {
      jobs: outside.length,
      completed: outsideCompleted,
      terminal: outsideTerminal,
      uniqueBuyers: outsideBuyers.size,
      completionRate: outsideTerminal > 0 ? outsideCompleted / outsideTerminal : null,
    },
  };
}
