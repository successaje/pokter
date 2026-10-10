'use client';

import { WalletRoot } from '@/shell/wallet/WalletRoot';
import { CampaignProgress } from './CampaignProgress';

/** Campaign progress with its own wallet context, for public pages. */
export default function CampaignTracker() {
  return (
    <WalletRoot>
      <CampaignProgress />
    </WalletRoot>
  );
}
