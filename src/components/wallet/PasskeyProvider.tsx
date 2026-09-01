'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  WALLET_NETWORK,
  clearStoredWallet,
  getServerWallet,
  getStoredWallet,
  passkeysSupported,
  saveStoredWallet,
  signerFor,
  subscribeToWallet,
  walletClient,
  type StoredWallet,
} from '@/lib/wallet/passkey';

interface PasskeyContextValue {
  wallet: StoredWallet | null;
  /** Null until the stored handle has been read on the client. */
  ready: boolean;
  supported: boolean;
  busy: 'creating' | 'recovering' | null;
  error: string | null;
  create: () => Promise<void>;
  recover: () => Promise<void>;
  forget: () => void;
}

const PasskeyContext = createContext<PasskeyContextValue | null>(null);

/** Subscriptions for values that never change after load. */
const NEVER_CHANGES = () => () => {};
const TRUE = () => true;
const FALSE = () => false;

export function usePasskeyWallet(): PasskeyContextValue {
  const value = useContext(PasskeyContext);
  if (!value) throw new Error('usePasskeyWallet used outside PasskeyProvider');
  return value;
}

/**
 * Holds the passkey wallet for the session.
 *
 * The stored handle is read through useSyncExternalStore rather than copied
 * into state by an effect: localStorage is an external store, the server has no
 * view of it, and a write in another tab should be reflected here. `ready`
 * exists because the server snapshot is always null, so the UI must not claim
 * "no wallet" until the client has actually looked.
 */
export function PasskeyProvider({ children }: { children: React.ReactNode }) {
  const wallet = useSyncExternalStore(
    subscribeToWallet,
    getStoredWallet,
    getServerWallet,
  );

  // Capability and client-readiness are both facts about the environment rather
  // than React state, and neither ever changes after load — so they are read
  // through the same external-store mechanism with a no-op subscription, which
  // keeps the server snapshot explicit and avoids a render-triggering effect.
  const supported = useSyncExternalStore(NEVER_CHANGES, passkeysSupported, FALSE);
  const ready = useSyncExternalStore(NEVER_CHANGES, TRUE, FALSE);

  const [busy, setBusy] = useState<'creating' | 'recovering' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async () => {
    setBusy('creating');
    setError(null);
    try {
      const result = await walletClient().createPasskeyWallet({ name: 'Pokter' });
      const stored: StoredWallet = {
        address: result.address,
        credential: result.signer.credential,
      };
      saveStoredWallet(stored);
    } catch (caught) {
      // A user dismissing the OS prompt lands here; it is a choice, not a fault.
      const message = (caught as Error).message ?? 'Passkey creation failed.';
      setError(
        /NotAllowed|abort/i.test(message)
          ? 'Passkey prompt was dismissed. Nothing was created.'
          : message,
      );
    } finally {
      setBusy(null);
    }
  }, []);

  const recover = useCallback(async () => {
    setBusy('recovering');
    setError(null);
    try {
      const result = await walletClient().recoverFromPasskey({
        chainId: WALLET_NETWORK.chainId,
      });
      const stored: StoredWallet = {
        address: result.address,
        credential: result.signer.credential,
      };
      saveStoredWallet(stored);
    } catch (caught) {
      const message = (caught as Error).message ?? 'Recovery failed.';
      setError(
        /NotAllowed|abort/i.test(message)
          ? 'Passkey prompt was dismissed.'
          : message,
      );
    } finally {
      setBusy(null);
    }
  }, []);

  const forget = useCallback(() => {
    clearStoredWallet();
    setError(null);
  }, []);

  const value = useMemo<PasskeyContextValue>(
    () => ({ wallet, ready, supported, busy, error, create, recover, forget }),
    [wallet, ready, supported, busy, error, create, recover, forget],
  );

  return <PasskeyContext.Provider value={value}>{children}</PasskeyContext.Provider>;
}

/** Signer for the connected wallet, or null when there is none. */
export function usePasskeySigner() {
  const { wallet } = usePasskeyWallet();
  return useMemo(() => (wallet ? signerFor(wallet) : null), [wallet]);
}
