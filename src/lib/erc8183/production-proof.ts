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
  /**
   * Self-hires inside the outside-funded set, which is the only self-hire
   * figure that belongs beside it: the total includes team-funded ones, and
   * subtracting it from the funder count gave arithmetic that did not work.
   */
  outsideSelfHireJobs: number;
  outsideDemandJobs: number;
  teamJobs: number;
  unknownFunderJobs: number;
  /**
   * Accepted jobs whose deliverable carried no answer from the agent, and
   * the remainder that did.
   *
   * `completed` is an escrow fact: the contract reached COMPLETED. It is not
   * a count of useful work, because Pokter's own lifecycle demonstrations
   * settle exactly the same way — five of the thirteen accepted deliveries
   * on this page were demos with no agent answer, and the page published
   * "13 Accepted deliveries" and "87% terminal completion" above rows that
   * said so one by one. The per-row labels were honest and the headline
   * undid them.
   *
   * Agent pages already drop demos from economic history
   * (`summariseEconomicHistory`); this is the same exclusion for the proof
   * page, as a separate figure rather than a redefinition of `completed`.
   * The escrow fact stays available, and nothing is removed from the rows.
   */
  lifecycleDemoJobs: number;
  answeredDeliveries: number;
  /** Accepted jobs whose buyer was the seller, not counted as answered deliveries. */
  completedSelfHires: number;
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
/** Buyer and seller the same wallet: an operator funding their own agent. */
export function isSelfHire(job: HiredJob): boolean {
  return Boolean(job.client) && job.client!.toLowerCase() === String(job.provider ?? '').toLowerCase();
}

export function summarizeProductionProof(
  jobs: readonly HiredJob[],
  isTeamFunded: (job: HiredJob) => boolean,
  /*
   * Optional, and absent means "no demo is known" rather than "none exist":
   * the caller reads stored manifests to decide, which not every caller can
   * do. Left out, `answeredDeliveries` equals `completed` — the figure the
   * page showed before, so an un-wired caller cannot silently under-report
   * useful work.
   */
  isLifecycleDemo: (job: HiredJob) => boolean = () => false,
): ProductionProofSummary {
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<JobStatusName, number>;
  const buyers = new Map<string, number>();
  const agents = new Set<string>();
  let completedValue = 0n;
  let outsideTeamJobs = 0;
  let teamJobs = 0;
  let unknownFunderJobs = 0;
  let selfHireJobs = 0;
  let lifecycleDemoJobs = 0;
  let completedSelfHires = 0;
  let lastCheckedAt: string | null = null;

  for (const job of jobs) {
    byStatus[job.status] += 1;
    if (job.status === 'COMPLETED' && isLifecycleDemo(job)) lifecycleDemoJobs += 1;
    else if (job.status === 'COMPLETED' && isSelfHire(job)) completedSelfHires += 1;
    const team = isTeamFunded(job);
    if (isSelfHire(job)) selfHireJobs += 1;
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
    lifecycleDemoJobs,
    /*
     * Accepted, carrying the agent's answer, and not a self-hire. A job whose
     * buyer is its seller settles like any other and proves nothing about
     * demand; an outside review counted 8 here where the strict figure was 7.
     */
    answeredDeliveries: byStatus.COMPLETED - lifecycleDemoJobs - completedSelfHires,
    completedSelfHires,
    outsideSelfHireJobs: jobs.filter((job) => !isTeamFunded(job) && isSelfHire(job)).length,
    outsideDemandJobs: jobs.filter((job) => !isTeamFunded(job) && !isSelfHire(job)).length,
    teamJobs,
    unknownFunderJobs,
    byStatus,
    lastCheckedAt,
  };
}
