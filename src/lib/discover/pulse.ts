import 'server-only';

import { getJobStore } from '@/lib/erc8183/store';
import { getSessionStore } from '@/lib/altana/store';

export interface MarketplaceActivity {
  hires: number;
  deliveries: number;
  settlements: number;
  activeSessions: number;
}

/**
 * Product activity that Pokter can substantiate from its own indexes.
 *
 * These are deliberately lifecycle counts, not popularity claims. The chain
 * remains authoritative for every job and the activity UI labels this scope so
 * a small demo history cannot be mistaken for network-wide volume.
 */
export function getMarketplaceActivity(): MarketplaceActivity {
  const jobs = getJobStore().all();
  const sessions = getSessionStore().all();

  return {
    hires: jobs.filter((job) => Boolean(job.hireTxHash)).length,
    deliveries: jobs.filter((job) =>
      ['SUBMITTED', 'COMPLETED'].includes(job.status),
    ).length,
    settlements: jobs.filter(
      (job) => job.status === 'COMPLETED' && Boolean(job.settleTxHash),
    ).length,
    activeSessions: sessions.filter((session) => !session.revokedAt).length,
  };
}
