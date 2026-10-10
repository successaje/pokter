'use client';

import dynamic from 'next/dynamic';

/* Wallet libraries load after the guide is readable, not before. */
export const LazyCampaignTracker = dynamic(() => import('./CampaignTracker'), {
  ssr: false,
  loading: () => <div aria-hidden className="h-[132px] animate-pulse rounded-[14px] border border-rule bg-raised" />,
});
