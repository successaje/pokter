'use client';

import type { ReactNode } from 'react';

import { WalletProviders } from '@/lib/wallet/Providers';
import { ConnectProvider } from './ConnectProvider';

/**
 * Wallet context (wagmi, react-query, passkey) plus the connect sheet.
 * Mounted by the layouts that act on a wallet (app, hire flow) and by the
 * public header's lazily loaded account island, so public pages do not
 * ship the wallet libraries in their first load.
 */
export function WalletRoot({ children }: { children: ReactNode }) {
  return (
    <WalletProviders>
      <ConnectProvider>{children}</ConnectProvider>
    </WalletProviders>
  );
}
