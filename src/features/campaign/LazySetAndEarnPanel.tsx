'use client';

import dynamic from 'next/dynamic';

/* Wallet libraries load after the page is readable, not before. */
export const LazySetAndEarnPanel = dynamic(() => import('./SetAndEarnPanel'), {
  ssr: false,
  loading: () => (
    <div aria-hidden className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="h-[420px] animate-pulse rounded-[18px] border border-rule bg-raised" />
      <div className="h-[340px] animate-pulse rounded-[18px] border border-rule bg-raised" />
    </div>
  ),
});
