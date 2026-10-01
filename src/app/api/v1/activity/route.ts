import { formatUnits } from 'viem';

import { apiJson, apiOptions, apiRateLimit } from '@/lib/api/respond';
import { summarizeMarketplaceActivity } from '@/lib/erc8183/activity-stats';
import { getJobStore } from '@/lib/erc8183/store';
import { ALTANA_NETWORK, IS_TESTNET } from '@/lib/altana/client';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return apiOptions();
}

export function GET(request: Request) {
  const limited = apiRateLimit(request, 'activity');
  if (limited) return limited;
  const stats = summarizeMarketplaceActivity(getJobStore().all());
  return apiJson({
    network: {
      chainId: ALTANA_NETWORK.chainId,
      name: ALTANA_NETWORK.chain.name,
      testnet: IS_TESTNET,
    },
    activity: {
      indexedJobs: stats.indexedJobs,
      activeJobs: stats.activeJobs,
      completedJobs: stats.completedJobs,
      byStatus: stats.byStatus,
      indexedValue: { raw: stats.indexedValueRaw, amountU: formatUnits(BigInt(stats.indexedValueRaw), 18) },
      completedValue: { raw: stats.completedValueRaw, amountU: formatUnits(BigInt(stats.completedValueRaw), 18) },
      lastCheckedAt: stats.lastCheckedAt,
    },
    scope: 'Jobs commissioned through Pokter and verified against ERC-8183. No task text, email, or wallet address is returned.',
  });
}
