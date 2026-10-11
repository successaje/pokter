import { formatUnits } from 'viem';

import { apiJson, apiOptions, apiRateLimit } from '@/lib/api/respond';
import { summarizeMarketplaceActivity } from '@/lib/erc8183/activity-stats';
import { getJobStore } from '@/lib/erc8183/store';
import { ALTANA_NETWORK, IS_TESTNET } from '@/lib/altana/client';
import { enabledEscrowChains } from '@/lib/network/escrow';
import { chainLabel } from '@/lib/network/presentation';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return apiOptions();
}

function summary(jobs: ReturnType<ReturnType<typeof getJobStore>['all']>) {
  const stats = summarizeMarketplaceActivity(jobs);
  return {
    indexedJobs: stats.indexedJobs,
    activeJobs: stats.activeJobs,
    completedJobs: stats.completedJobs,
    byStatus: stats.byStatus,
    indexedValue: { raw: stats.indexedValueRaw, amountU: formatUnits(BigInt(stats.indexedValueRaw), 18) },
    completedValue: { raw: stats.completedValueRaw, amountU: formatUnits(BigInt(stats.completedValueRaw), 18) },
    lastCheckedAt: stats.lastCheckedAt,
  };
}

export function GET(request: Request) {
  const limited = apiRateLimit(request, 'activity');
  if (limited) return limited;
  const all = getJobStore().all();
  /*
   * Per escrow chain, never summed: mainnet $U is money and testnet $U is
   * not, so one total would describe neither. `network` and `activity` stay
   * the default network's, as they were before hires could be funded on more
   * than one escrow.
   */
  const chains = [...new Set([ALTANA_NETWORK.chainId, ...enabledEscrowChains(), ...all.map((job) => job.chainId)])]
    .filter((chainId) => chainId === 56 || chainId === 97);
  return apiJson({
    network: {
      chainId: ALTANA_NETWORK.chainId,
      name: ALTANA_NETWORK.chain.name,
      testnet: IS_TESTNET,
    },
    activity: summary(all.filter((job) => job.chainId === ALTANA_NETWORK.chainId)),
    byChain: chains.map((chainId) => ({
      chainId,
      name: chainLabel(chainId),
      testnet: chainId === 97,
      activity: summary(all.filter((job) => job.chainId === chainId)),
    })),
    scope: 'Jobs commissioned through Pokter and verified against ERC-8183. No task text, email, or wallet address is returned.',
  });
}
