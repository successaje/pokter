'use client';

import { useEffect, useState } from 'react';
import type { Address } from 'viem';

import { externalAccount, hasInjectedWallet } from '@/lib/wallet/external';

/**
 * The injected wallet's address, if one is already authorised.
 *
 * Reads `eth_accounts` rather than `eth_requestAccounts`: this runs on render
 * and must never raise a connect prompt on its own. A page that asks for a
 * wallet because someone looked at it is a page people stop looking at.
 */
export function useExternalAccount(): Address | null {
  const [account, setAccount] = useState<Address | null>(null);

  useEffect(() => {
    if (!hasInjectedWallet()) return;
    let active = true;

    const sync = () => {
      externalAccount().then((next) => {
        if (active) setAccount(next);
      });
    };
    sync();

    // Reflect the wallet being switched or disconnected from the extension.
    const injected = (
      globalThis as unknown as {
        ethereum?: {
          on?: (event: string, handler: () => void) => void;
          removeListener?: (event: string, handler: () => void) => void;
        };
      }
    ).ethereum;
    injected?.on?.('accountsChanged', sync);

    return () => {
      active = false;
      injected?.removeListener?.('accountsChanged', sync);
    };
  }, []);

  return account;
}
