import { formatUnits } from 'viem';

import { defaultHireToken } from '@/lib/network/tokens';
import { apiJson, apiOptions, apiRateLimit } from '@/lib/api/respond';
import { summarizeMarketplaceActivity } from '@/lib/erc8183/activity-stats';
import { getJobStore } from '@/lib/erc8183/store';
import { ALTANA_NETWORK, IS_TESTNET } from '@/lib/altana/client';
import { enabledEscrowChains } from '@/lib/network/escrow';
import { teamWalletList, teamWalletSet } from '@/lib/team/server';
import { fundedByTeam } from '@/lib/team/wallets';
import { chainLabel } from '@/lib/network/presentation';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return apiOptions();
}

function summary(chainId: number, jobs: ReturnType<ReturnType<typeof getJobStore>['all']>) {
  const stats = summarizeMarketplaceActivity(jobs);
  /* $U's scale from the registry, not a literal: `amountU` is the $U figure on this chain. */
  const u = defaultHireToken(chainId);
  const amountU = (raw: string) => (u ? formatUnits(BigInt(raw), u.decimals) : null);
  return {
    indexedJobs: stats.indexedJobs,
    activeJobs: stats.activeJobs,
    completedJobs: stats.completedJobs,
    byStatus: stats.byStatus,
    indexedValue: { raw: stats.indexedValueRaw, amountU: amountU(stats.indexedValueRaw) },
    completedValue: { raw: stats.completedValueRaw, amountU: amountU(stats.completedValueRaw) },
    /*
     * The two values above are $U only. Every token's own figure, always:
     * gating it on the hire-token flag meant a rollback that turned USDT
     * hiring off would hide the funded USDT jobs that already exist, which
     * is exactly when a reader needs to see them.
     */
    valueByToken: stats.valueByToken,
    lastCheckedAt: stats.lastCheckedAt,
  };
}

export function GET(request: Request) {
  const limited = apiRateLimit(request, 'activity');
  if (limited) return limited;
  const all = getJobStore().all();
  // Jobs Pokter's own wallets funded were tests of the hire flow. Totals keep
  // them, as before; `buyers` leaves them out, and the wallets are listed so
  // the split can be checked against the chain.
  const team = teamWalletSet();
  const buyers = all.filter((job) => !fundedByTeam(job, team));
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
    activity: summary(ALTANA_NETWORK.chainId, all.filter((job) => job.chainId === ALTANA_NETWORK.chainId)),
    buyers: summary(ALTANA_NETWORK.chainId, buyers.filter((job) => job.chainId === ALTANA_NETWORK.chainId)),
    teamWallets: teamWalletList(),
    byChain: chains.map((chainId) => ({
      chainId,
      name: chainLabel(chainId),
      testnet: chainId === 97,
      activity: summary(chainId, all.filter((job) => job.chainId === chainId)),
      buyers: summary(chainId, buyers.filter((job) => job.chainId === chainId)),
    })),
    scope: 'Jobs commissioned through Pokter and verified against ERC-8183. `buyers` excludes jobs funded by the wallets in `teamWallets`, which are Pokter\'s own and published on purpose; no other wallet address, task text or email is returned.',
  });
}
