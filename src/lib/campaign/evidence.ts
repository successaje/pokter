import { explorerBaseFor } from '@/lib/network/presentation';
import type { CampaignProgressReport } from './progress-server';

/** Public, repeatable references for the facts Pokter can read about one campaign wallet. */
export function campaignEvidence(report: CampaignProgressReport) {
  const observedMs = Date.parse(report.observedAt);
  const indexStatus = report.coverage.some((row) => !row.updatedAt || !Number.isFinite(Date.parse(row.updatedAt)))
    ? 'unknown'
    : report.coverage.some((row) => observedMs - Date.parse(row.updatedAt!) > 6 * 60 * 60 * 1000)
      ? 'stale'
      : 'recent';
  const chainJob = (chainId: number, jobId: string, commerceContract: string) => ({
    chainId,
    jobId,
    commerceContract,
    contractReadUrl: `${explorerBaseFor(chainId)}/address/${commerceContract}#readContract`,
  });
  const contractOf = (chainId: number) => chainId === 56 || chainId === 97 ? report.commerceContracts[chainId] : null;

  return {
    format: 'pokter-set-and-earn-evidence',
    version: 1,
    wallet: report.address,
    observedAt: report.observedAt,
    indexStatus,
    registration: { verifiedByPokter: false, reason: 'Pokter cannot read BNB Chain’s campaign registration form.' },
    hires: {
      totalFunded: report.hires.total,
      distinctAgents: report.hires.distinctAgents,
      namedMarketplaces: report.hires.marketplaces,
      marketplacesStatus: report.hires.marketplacesStatus,
      unattributed: report.hires.unattributed,
      jobs: report.hires.records.map((job) => ({
        ...chainJob(job.chainId, job.jobId, job.commerceContract),
        status: job.status,
        provider: job.provider,
        marketplace: job.marketplace,
        agent: job.agent,
        hireTransactionUrl: job.hireTxHash ? `${explorerBaseFor(job.chainId)}/tx/${job.hireTxHash}` : null,
        settlementTransactionUrl: job.settleTxHash ? `${explorerBaseFor(job.chainId)}/tx/${job.settleTxHash}` : null,
      })),
    },
    registeredAgents: report.build?.map((agent) => ({
      ...agent,
      profileUrl: `/agents/${agent.chainId}/${agent.tokenId}`,
      registryContract: agent.chainId === 56 || agent.chainId === 97 ? report.identityRegistries[agent.chainId] : null,
      registryReadUrl: agent.chainId === 56 || agent.chainId === 97 ? `${explorerBaseFor(agent.chainId)}/address/${report.identityRegistries[agent.chainId]}#readContract` : null,
    })) ?? null,
    adoption: report.adoption ? {
      agent: { chainId: report.adoption.chainId, tokenId: report.adoption.tokenId, name: report.adoption.name },
      outsideOwnerWallets: report.adoption.independentWallets,
      countedSubmissions: report.adoption.actions,
      activeUtcDays: report.adoption.activeDays,
      actionsBlockedReason: report.adoption.actionsBlockedReason,
      unreadJobs: report.adoption.unreadJobs,
      completedHires: report.adoption.completedHires.map((job) => ({
        ...job,
        reference: contractOf(job.chainId) ? chainJob(job.chainId, job.jobId, contractOf(job.chainId)!) : null,
      })),
      submissions: report.adoption.ownActions.map((action) => ({
        ...action,
        reference: contractOf(action.chainId) ? chainJob(action.chainId, action.jobId, contractOf(action.chainId)!) : null,
      })),
    } : null,
    indexCoverage: report.coverage,
    limits: [
      'This is Pokter’s observation of public escrow and registry data, not a BNB Chain eligibility decision.',
      'The campaign registration form and hires settled outside the ERC-8183 contracts Pokter indexes are not visible here.',
      'A named marketplace comes from a job record or Pokter’s own job index. Unnamed marketplaces are left unattributed.',
      'Outside-owner wallets are counted by address. Pokter cannot verify that their funds are independent of the builder.',
      'Submission times are read from escrow jobs after excluding Pokter’s own seller. Pokter has not independently verified each provider against the agent’s registered wallet or checked that each action fits its category.',
      'A missing transaction URL means Pokter did not retain that transaction hash; use the contract and job ID to re-read the onchain record.',
      'Indexer coverage has its own timestamp. Jobs newer than that timestamp may be absent from this record.',
    ],
  };
}

export type CampaignEvidence = ReturnType<typeof campaignEvidence>;
