'use client';

import { useCallback } from 'react';
import { useLiveSignMessage } from '@/lib/wallet/use-live-sign-message';

import { useActiveWallet } from '@/lib/wallet/active';
import { signPasskeyMessage } from '@/lib/wallet/passkey-message';
import { usePasskeyWallet } from '@/lib/wallet/PasskeyProvider';

/**
 * Sign a message with whichever wallet is connected.
 *
 * A passkey has no wagmi connector, so every form that asks for a
 * signature has to branch — and the two that already did got it wrong in
 * the same way, refusing a passkey with "cannot sign messages yet" when
 * the wallet was perfectly capable and only the shape asked for was wrong.
 * One place to get it right, rather than a third copy.
 */
export function useActiveSigner(): {
  address: `0x${string}` | undefined;
  canSign: boolean;
  sign: (message: string) => Promise<`0x${string}`>;
} {
  const active = useActiveWallet();
  const passkey = usePasskeyWallet();
  const { signMessageAsync } = useLiveSignMessage();
  const canSign = Boolean(active.address && (active.mode === 'external' || (active.mode === 'passkey' && passkey.wallet)));

  const sign = useCallback(
    async (message: string) => {
      if (active.mode === 'passkey' && passkey.wallet) return signPasskeyMessage(passkey.wallet, message);
      return signMessageAsync({ message });
    },
    [active.mode, passkey.wallet, signMessageAsync],
  );

  return { address: active.address as `0x${string}` | undefined, canSign, sign };
}
