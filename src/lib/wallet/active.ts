'use client';

import type { Address } from 'viem';
import { useAccount } from 'wagmi';

import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { ESCROW_CHAIN } from '@/lib/wallet/config';

export type WalletMode = 'passkey' | 'external';

export interface ActiveWallet {
  /** Null when nothing can sign yet. */
  mode: WalletMode | null;
  address: Address | null;
  /** A browser wallet is connected but pointed at the wrong network. */
  wrongChain: boolean;
}

/**
 * Which wallet is going to sign, worked out rather than asked about.
 *
 * The first version of this put a passkey/browser toggle on the hire page,
 * which was the wrong place twice over: choosing a wallet belongs where you
 * connect one, and a hire should not ask a question it can answer. Connecting
 * a browser wallet is already a deliberate act, so it is the answer — the hire
 * form reads this and routes itself.
 *
 * A browser wallet on the wrong network is reported rather than used. It can
 * sign, but not here, and silently falling back to the passkey would hire from
 * a wallet the person was not looking at.
 */
export function useActiveWallet(): ActiveWallet {
  const passkey = usePasskeyWallet();
  const { address, isConnected, chain } = useAccount();

  const wrongChain = Boolean(isConnected && chain?.id !== ESCROW_CHAIN.id);

  if (isConnected && address && !wrongChain) {
    return { mode: 'external', address, wrongChain: false };
  }

  if (passkey.wallet) {
    return { mode: 'passkey', address: passkey.wallet.address, wrongChain };
  }

  return { mode: null, address: null, wrongChain };
}
