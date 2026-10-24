'use client';

import { useCallback } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';

import { wagmiConfig } from './config';
import { liveConnector } from './live-connector';

type SignArgs = Parameters<ReturnType<typeof useSignTypedData>['signTypedDataAsync']>[0];

/**
 * wagmi's useSignTypedData through the live connector, for the same reason
 * as `useLiveSignMessage`: a restored session reads as connected before
 * wagmi has reconnected it. Browser wallets only: a passkey wallet is a
 * contract account whose signatures a token's `transferWithAuthorization`
 * cannot check, so typed-data payments are not offered to it.
 */
export function useLiveSignTypedData() {
  const { signTypedDataAsync, ...rest } = useSignTypedData();
  const { connector } = useAccount();
  const sign = useCallback(
    async (args: SignArgs) => {
      const live = liveConnector(connector, wagmiConfig.connectors);
      if (connector && !live) throw new Error('Your wallet is still reconnecting. Try again in a moment.');
      return signTypedDataAsync(live ? { ...args, connector: live } : args);
    },
    [connector, signTypedDataAsync],
  );
  return { ...rest, signTypedDataAsync: sign };
}
