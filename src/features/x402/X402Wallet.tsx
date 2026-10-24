'use client';

import { WalletRoot } from '@/shell/wallet/WalletRoot';
import { X402Panel } from './X402Panel';

/** The panel inside its own wallet context: loaded only when the buyer asks, as the header's wallet island is. */
export default function X402Wallet(props: { chainId: number; tokenId: string }) {
  return (
    <WalletRoot>
      <X402Panel {...props} />
    </WalletRoot>
  );
}
