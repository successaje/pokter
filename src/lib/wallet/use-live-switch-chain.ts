'use client';

import { useCallback, useState } from 'react';
import { useSwitchChain } from 'wagmi';

import { wagmiConfig } from './config';
import { switchThroughLive } from './live-connector';

type Chain = 56 | 97;

/**
 * wagmi's useSwitchChain, safe during a reconnect.
 *
 * A session restored from storage reads as connected while its connection
 * still holds a stand-in connector with no methods; switching through it
 * failed until the page was refreshed. Every network switch on the site
 * goes through here, the way every signature goes through
 * useLiveSignMessage.
 */
export function useLiveSwitchChain() {
  const { switchChainAsync: wagmiSwitch, isPending, error, reset } = useSwitchChain();
  const [ownPending, setOwnPending] = useState(false);
  const [ownError, setOwnError] = useState<Error | null>(null);

  const switchChainAsync = useCallback(
    async ({ chainId }: { chainId: Chain }) => {
      setOwnError(null);
      setOwnPending(true);
      try {
        if (await switchThroughLive(wagmiConfig as never, chainId)) return;
      } catch (caught) {
        setOwnError(caught as Error);
        throw caught;
      } finally {
        setOwnPending(false);
      }
      await wagmiSwitch({ chainId });
    },
    [wagmiSwitch],
  );
  const switchChain = useCallback((args: { chainId: Chain }) => void switchChainAsync(args).catch(() => {}), [switchChainAsync]);

  return { switchChain, switchChainAsync, isPending: isPending || ownPending, error: ownError ?? error, reset };
}
