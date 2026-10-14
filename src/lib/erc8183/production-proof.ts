import type { HiredJob, JobStatusName } from './types';

export type ProofNetwork = 'all' | 'mainnet' | 'testnet';
export type ProofFunder = 'all' | 'outside-team' | 'team';
export type ProofWindow = '7d' | '30d' | 'all';

export interface ProductionProofFilters {
  network: ProofNetwork;
  funder: ProofFunder;
  window: ProofWindow;
}

export interface ProductionProofSummary {
  jobs: number;
  completed: number;
  rejected: number;
  expired: number;
  active: number;
  terminal: number;
  /** Completed jobs divided by jobs with a terminal on-chain outcome. */
  completionRate: number | null;
  uniqueKnownBuyers: number;
  repeatKnownBuyers: number;
  agentsHired: number;
  completedValueRaw: string;
  outsideTeamJobs: number;
  /**
   * Of the outside-funded jobs, the ones whose buyer and seller are the same
   * wallet, and the remainder that are actually demand.
   *
   * The funder split alone read "Outside declared team 9" while the receipt
   * API published six, because one counts wallets and the other counts
   * demand. Both were true and together they looked like a contradiction,
   * with the flattering number on the page people read.
   */
  selfHireJobs: number;
  outsideDemandJobs: number;
  teamJobs: number;
  unknownFunderJobs: number;
  byStatus: Record<JobStatusName, number>;
  lastCheckedAt: string | null;
}

const STATUSES: JobStatusName[] = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'];

function afterWindow(job: HiredJob, window: ProofWindow, nowMs: number): boolean {
  if (window === 'all') return true;
  const days = window === '7d' ? 7 : 30;
  const hiredAt = Date.parse(job.hiredAt);
  return Number.isFinite(hiredAt) && hiredAt >= nowMs - days * 24 * 60 * 60 * 1000;
}

function onNetwork(job: HiredJob, network: ProofNetwork): boolean {
  if (network === 'mainnet') return job.chainId === 56;
  if (network === 'testnet') return job.chainId === 97;
  return true;
}

/**
 * Selects the exact receipt population shown on the production-proof page.
 *
 * Missing funders are classified as team jobs by `isTeamFunded`: they are
 * legacy operator activity, not evidence of outside demand. This deliberately
 * makes the outside-team number smaller rather than assigning unknown work to
 * the more flattering bucket.
 */
export function filterProductionJobs(
  jobs: readonly HiredJob[],
  filters: ProductionProofFilters,
  isTeamFunded: (job: HiredJob) => boolean,
  nowMs: number,
): HiredJob[] {
  return jobs.filter((job) => {
    if (!onNetwork(job, filters.network) || !afterWindow(job, filters.window, nowMs)) return false;
    if (filters.funder === 'team') return isTeamFunded(job);
    if (filters.funder === 'outside-team') return !isTeamFunded(job);
    return true;
  });
}

/** Runtime convenience for server callers; the explicit-time form stays deterministic in tests. */
export function filterCurrentProductionJobs(
  jobs: readonly HiredJob[],
  filters: ProductionProofFilters,
  isTeamFunded: (job: HiredJob) => boolean,
): HiredJob[] {
  return filterProductionJobs(jobs, filters, isTeamFunded, Date.now());
}

/** Pure aggregation used by the page and tests; it never reads environment state. */
export function summarizeProductionProof(
  jobs: readonly HiredJob[],
  isTeamFunded: (job: HiredJob) => boolean,
): ProductionProofSummary {
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<JobStatusName, number>;
  const buyers = new Map<string, number>();
  const agents = new Set<string>();
  let completedValue = 0n;
  let outsideTeamJobs = 0;
  let teamJobs = 0;
  let unknownFunderJobs = 0;
  let selfHireJobs = 0;
  let lastCheckedAt: string | null = null;

  for (const job of jobs) {
    byStatus[job.status] += 1;
    const team = isTeamFunded(job);
    const selfHire = Boolean(job.client) && job.client!.toLowerCase() === String(job.provider ?? '').toLowerCase();
    if (selfHire) selfHireJobs += 1;
    if (team) teamJobs += 1;
    else outsideTeamJobs += 1;
    if (!job.client) unknownFunderJobs += 1;
    if (job.client) {
      const buyer = job.client.toLowerCase();
      buyers.set(buyer, (buyers.get(buyer) ?? 0) + 1);
    }
    agents.add(`${job.agentChainId ?? job.chainId}:${job.agentTokenId}`);
    if (job.status === 'COMPLETED') completedValue += BigInt(job.budgetRaw);
    if (!lastCheckedAt || job.statusCheckedAt > lastCheckedAt) lastCheckedAt = job.statusCheckedAt;
  }

  const terminal = byStatus.COMPLETED + byStatus.REJECTED + byStatus.EXPIRED;
  return {
    jobs: jobs.length,
    completed: byStatus.COMPLETED,
    rejected: byStatus.REJECTED,
    expired: byStatus.EXPIRED,
    active: byStatus.FUNDED + byStatus.SUBMITTED,
    terminal,
    completionRate: terminal > 0 ? byStatus.COMPLETED / terminal : null,
    uniqueKnownBuyers: buyers.size,
    repeatKnownBuyers: [...buyers.values()].filter((count) => count >= 2).length,
    agentsHired: agents.size,
    completedValueRaw: completedValue.toString(),
    outsideTeamJobs,
    selfHireJobs,
    outsideDemandJobs: jobs.filter((job) => {
      const selfHire = Boolean(job.client) && job.client!.toLowerCase() === String(job.provider ?? '').toLowerCase();
      return !isTeamFunded(job) && !selfHire;
    }).length,
    teamJobs,
    unknownFunderJobs,
    byStatus,
    lastCheckedAt,
  };
}
