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
  completed: number;
  rejected: number;
  expired: number;
  /**
   * Funded jobs the agent let lapse: EXPIRED, or still FUNDED after the
   * deadline. The contract only marks a job EXPIRED once its escrow is
   * reclaimed, so a missed job nobody reclaimed still reads FUNDED, and
   * counting EXPIRED alone would understate misses.
   */
  missed: number;
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
    refusedAtNotice,
  }: { isLifecycleDemo?: (job: HiredJob) => boolean; refusedAtNotice?: (job: HiredJob) => boolean } = {},
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
    completed: funded.filter((job) => job.status === 'COMPLETED').length,
    rejected: funded.filter((job) => job.status === 'REJECTED').length,
    expired: funded.filter((job) => job.status === 'EXPIRED').length,
    missed: funded.filter((job) => (job.status === 'EXPIRED' && !refused(job)) || lapsed(job)).length,
    pending: funded.filter((job) => job.status === 'FUNDED' && !lapsed(job) && !refused(job)).length,
    refused: funded.filter(refused).length,
    unresolved: funded.filter((job) =>
      ['FUNDED', 'SUBMITTED'].includes(job.status),
    ).length,
    totalFundedU: formatUnits(total, 18),
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
