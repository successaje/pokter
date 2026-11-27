'use client';

import type { Address } from 'viem';
import { useAccount } from 'wagmi';

import { usePasskeyWallet } from '@/lib/wallet/PasskeyProvider';
import { isEscrowChain } from '@/lib/network/escrow';
import { passkeyActsOn } from '@/lib/wallet/passkey-networks';

export type WalletMode = 'passkey' | 'external';

export interface ActiveWallet {
  /** Null when nothing can sign yet. */
  mode: WalletMode | null;
  address: Address | null;
  /** A browser wallet is connected but pointed at the wrong network. */
  wrongChain: boolean;
  /**
   * The passkey wallet exists but cannot act on this escrow chain: it was
   * not set up there, or the site has not opened passkeys there
   * (`passkeyActsOn`). A hire there needs a browser wallet.
   */
  passkeyUnsupported: boolean;
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
export function useActiveWallet(escrowChainId?: number): ActiveWallet {
  const passkey = usePasskeyWallet();
  const { address, isConnected, chain } = useAccount();

  // A hire asks for the chain it funds on. Everywhere else the wallet only
  // identifies the buyer, so any escrow chain hires can be funded on will do:
  // a wallet left on mainnet after a mainnet hire is still that buyer's.
  const wrongChain = Boolean(
    isConnected && (escrowChainId === undefined ? !chain || !isEscrowChain(chain.id) : chain?.id !== escrowChainId),
  );
  /* A passkey acts on a network it was set up on and the site has opened (`passkeyActsOn`). */
  const passkeyUnsupported = Boolean(passkey.wallet) && escrowChainId !== undefined && !passkeyActsOn(passkey.wallet, escrowChainId);

  if (isConnected && address && !wrongChain) {
    return { mode: 'external', address, wrongChain: false, passkeyUnsupported };
  }

  if (passkey.wallet && !passkeyUnsupported) {
    return { mode: 'passkey', address: passkey.wallet.address, wrongChain, passkeyUnsupported };
  }

  return { mode: null, address: null, wrongChain, passkeyUnsupported };
}
