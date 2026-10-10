'use client';

import dynamic from 'next/dynamic';

import { buttonClass } from '@/ui/Button';

/*
 * Loaded after the page is interactive. The placeholder holds the button's
 * exact footprint so nothing shifts when the real control arrives.
 */
export const LazyHeaderWallet = dynamic(() => import('./HeaderWallet'), {
  ssr: false,
  loading: () => (
    <span aria-hidden className={buttonClass('secondary', 's', 'w-[84px] text-ink-3')}>
      Connect
    </span>
  ),
});
