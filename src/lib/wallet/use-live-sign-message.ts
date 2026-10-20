'use client';

import { useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

import { wagmiConfig } from './config';
import { liveConnector } from './live-connector';

type SignArgs = Parameters<ReturnType<typeof useSignMessage>['signMessageAsync']>[0];

/**
 * wagmi's useSignMessage, signing through the live connector.
 *
 * A session restored from storage reads as connected before wagmi has
 * finished reconnecting it, and signing through the stored connection in
 * that window fails with "connection.connector.getChainId is not a
 * function". Every signature on the site goes through here (or through
 * `useActiveSigner`, which uses it), so none can hit that window.
 */
export function useLiveSignMessage() {
  const { signMessageAsync, ...rest } = useSignMessage();
  const { connector } = useAccount();
  const sign = useCallback(
    async (args: SignArgs) => {
      if (args.connector) return signMessageAsync(args);
      const live = liveConnector(connector, wagmiConfig.connectors);
      if (connector && !live) throw new Error('Your wallet is still reconnecting. Try again in a moment.');
      return signMessageAsync(live ? { ...args, connector: live } : args);
    },
    [connector, signMessageAsync],
  );
  return { ...rest, signMessageAsync: sign };
}
