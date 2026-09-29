import 'server-only';

import { getJobStore } from '@/lib/erc8183/store';

export interface MarketplaceActivity {
  hires: number;
  deliveries: number;
  settlements: number;
}

/**
 * Product activity that Pokter can substantiate from its own indexes.
 *
 * These are deliberately lifecycle counts, not popularity claims. The chain
 * remains authoritative for every job and the activity UI labels this scope so
 * a small demo history cannot be mistaken for network-wide volume.
 */
/*
 * Delegated-session counts are deliberately absent.
 *
 * Counting grants with no revocation on record surfaced historical testnet
 * sessions as live marketplace activity, while the rest of the product states
 * that Pokter creates no new delegated sessions. A viewer's own sessions are
 * still shown on their own activity page, where the scope is unambiguous.
 */
export function getMarketplaceActivity(): MarketplaceActivity {
  const jobs = getJobStore().all();

  return {
    hires: jobs.filter((job) => Boolean(job.hireTxHash)).length,
    deliveries: jobs.filter((job) =>
      ['SUBMITTED', 'COMPLETED'].includes(job.status),
    ).length,
    settlements: jobs.filter(
      (job) => job.status === 'COMPLETED' && Boolean(job.settleTxHash),
    ).length,
  };
}
