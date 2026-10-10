import type { Metadata } from 'next';

import { WalletRoot } from '@/shell/wallet/WalletRoot';

export const metadata: Metadata = { robots: { index: false } };

/*
 * Transaction flows (hiring) get a layout of their own: no site navigation
 * to wander off into mid-payment, just the flow and a way out.
 */
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletRoot>
      <div className="min-h-dvh">{children}</div>
    </WalletRoot>
  );
}
