import { fundingEvidence } from '@/lib/erc8183/funding-evidence';
import type { HiredJob, JobStatusName } from '@/lib/erc8183/types';
import { jobFunder, type JobFunder } from '@/lib/jobs/evidence-view';

/** The proof page and receipts API use these same row predicates. No inferred buyer identity. */
export type LedgerMetric = 'funded' | 'submitted' | 'settled' | 'outside-wallets' | 'team' | 'self' | 'demo';
export type LedgerStatus = 'all' | JobStatusName;
export type LedgerFunder = 'all' | JobFunder;

export interface LedgerFilters {
  network: 'all' | 'mainnet' | 'testnet';
  funder: LedgerFunder;
  status: LedgerStatus;
  metric: LedgerMetric | null;
  q: string;
  agent: string | null;
}

export interface LedgerRow {
  job: HiredJob;
  funder: JobFunder;
  funded: boolean;
  lifecycleDemo: boolean;
  submitted: boolean;
  settled: boolean;
}

export function ledgerRows(jobs: readonly HiredJob[], team: ReadonlySet<string>, isLifecycleDemo: (job: HiredJob) => boolean): LedgerRow[] {
  return jobs.map((job) => {
    const lifecycleDemo = isLifecycleDemo(job);
    return {
      job,
      funder: jobFunder({ client: job.client, provider: job.provider }, team),
      funded: fundingEvidence(job) === 'funded',
      lifecycleDemo,
      // Escrow submission is a chain state. A self-hosted answer still needs a separate hash check.
      submitted: (job.status === 'SUBMITTED' || job.status === 'COMPLETED') && !lifecycleDemo,
      settled: job.status === 'COMPLETED',
    };
  });
}

export function matchesMetric(row: LedgerRow, metric: LedgerMetric): boolean {
  switch (metric) {
    case 'funded': return row.funded;
    case 'submitted': return row.submitted;
    case 'settled': return row.settled;
    case 'outside-wallets': return row.funded && row.funder === 'outside' && !row.lifecycleDemo;
    case 'team': return row.funded && row.funder === 'team';
    case 'self': return row.funded && row.funder === 'self';
    case 'demo': return row.lifecycleDemo;
  }
}

export function filterLedger(rows: readonly LedgerRow[], filters: LedgerFilters): LedgerRow[] {
  const query = filters.q.toLowerCase();
  return rows.filter((row) => {
    const { job } = row;
    if (filters.network === 'mainnet' && job.chainId !== 56) return false;
    if (filters.network === 'testnet' && job.chainId !== 97) return false;
    if (filters.funder !== 'all' && row.funder !== filters.funder) return false;
    if (filters.status !== 'all' && job.status !== filters.status) return false;
    if (filters.metric && !matchesMetric(row, filters.metric)) return false;
    if (filters.agent && `${job.agentChainId ?? job.chainId}:${job.agentTokenId}` !== filters.agent) return false;
    if (!query) return true;
    return [job.jobId, `${job.chainId}:${job.jobId}`, job.agentName, job.agentTokenId, job.provider, job.client ?? '']
      .some((value) => value.toLowerCase().includes(query));
  });
}

export function summarizeLedger(rows: readonly LedgerRow[]) {
  const knownOutside = rows.filter((row) => matchesMetric(row, 'outside-wallets'));
  const checked = rows.map((row) => row.job.statusCheckedAt).filter((at) => Number.isFinite(Date.parse(at)));
  return {
    jobs: rows.length,
    funded: rows.filter((row) => row.funded).length,
    submitted: rows.filter((row) => row.submitted).length,
    settled: rows.filter((row) => row.settled).length,
    outsideWallets: new Set(knownOutside.map((row) => row.job.client!.toLowerCase())).size,
    outsideJobs: knownOutside.length,
    team: rows.filter((row) => matchesMetric(row, 'team')).length,
    self: rows.filter((row) => matchesMetric(row, 'self')).length,
    unknown: rows.filter((row) => row.funder === 'unknown').length,
    demos: rows.filter((row) => row.lifecycleDemo).length,
    oldestCheckedAt: checked.length ? checked.reduce((a, b) => a < b ? a : b) : null,
    newestCheckedAt: checked.length ? checked.reduce((a, b) => a > b ? a : b) : null,
  };
}
