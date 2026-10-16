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
  /** Distinct agents, one per agent however many chains it is registered on. */
  agentsHired: number;
  /** Distinct registry identities (chain and token id) behind `agentsHired`. */
  agentRegistrationsHired: number;
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

/**
 * One agent, however many chains it is registered on.
 *
 * An agent registered on BNB Chain and on testnet and hired on both was
 * counted twice under a tile that says "agents": Pokter's own five house
 * agents are the case in the record. Two registrations are the same agent
 * when they are on different chains and their jobs share an agent wallet
 * and a name, the rule search uses.
 *
 * Never two registrations on the same chain, and never on a name alone.
 * Jobs that Pokter's testnet delivery agent carried all share its wallet
 * and its label ("Verified testnet seller") whichever agent was hired, and
 * one operator runs several agents from one wallet. A job's stored name can
 * also be a label rather than the agent's ("Seller-release proof"), which
 * is why jobs are grouped by registration first.
 */
function distinctAgents(registrations: Set<string>, names: Map<string, Set<string>>): number {
  const parent = new Map<string, string>([...registrations].map((r) => [r, r]));
  const find = (r: string): string => {
    let root = r;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(r, root);
    return root;
  };
  const chainOf = (registration: string) => registration.split(':')[0];
  const seenOn = new Map<string, string[]>();
  for (const [registration, set] of names) {
    for (const key of set) {
      const earlier = seenOn.get(key) ?? [];
      for (const other of earlier) {
        if (chainOf(other) !== chainOf(registration)) parent.set(find(registration), find(other));
      }
      seenOn.set(key, [...earlier, registration]);
    }
  }
  return new Set([...registrations].map(find)).size;
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
  const registrations = new Set<string>();
  const registrationNames = new Map<string, Set<string>>();
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
    const registration = `${job.agentChainId ?? job.chainId}:${job.agentTokenId}`;
    registrations.add(registration);
    const name = (job.agentName ?? '').trim().toLowerCase();
    if (name && job.provider) {
      const names = registrationNames.get(registration) ?? new Set<string>();
      names.add(`${job.provider.toLowerCase()}|${name}`);
      registrationNames.set(registration, names);
    }
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
    agentsHired: distinctAgents(registrations, registrationNames),
    agentRegistrationsHired: registrations.size,
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
