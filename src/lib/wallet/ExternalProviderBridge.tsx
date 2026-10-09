'use client';

import { useEffect } from 'react';
import { useAccount } from 'wagmi';

import { setExternalProvider } from '@/lib/wallet/external';

/**
 * Hands the live connector's EIP-1193 provider to the hire path.
 *
 * `external.ts` is plain module code, not a hook, because the hire runs
 * outside React's render. It therefore cannot read wagmi itself, and used to
 * reach for `window.ethereum`. That works for an extension and not at all
 * for WalletConnect, where the wallet is on a phone.
 *
 * This component is the one place the two meet: it watches the connector and
 * pushes its provider down. Rendered once, inside WagmiProvider, drawing
 * nothing.
 */
export function ExternalProviderBridge() {
  const { connector, isConnected } = useAccount();

  useEffect(() => {
    let cancelled = false;
    if (!isConnected || !connector?.getProvider) {
      setExternalProvider(null);
      return;
    }
    connector
      .getProvider()
      .then((eip1193) => {
        if (!cancelled) {
          setExternalProvider(eip1193 as Parameters<typeof setExternalProvider>[0]);
        }
      })
      .catch(() => {
        // Leave the fallback in place; the hire reports NO_WALLET if neither works.
        if (!cancelled) setExternalProvider(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connector, isConnected]);

  return null;
}
