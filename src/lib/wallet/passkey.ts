'use client';

import {
  createClient,
  signerFromPasskey,
  BNB,
  BNB_TESTNET,
  type PasskeyCredential,
} from '@altananetwork/sdk';

/**
 * Passkey wallets.
 *
 * This is the SDK's intended browser path and the only one that gives the user
 * genuine custody: the P256 private key lives in the device's secure enclave,
 * every signature needs a biometric prompt, and Pokter never sees a key. It
 * replaces the operator key that previously signed every session.
 *
 * What we persist is the *credential handle* — a credential id, a public key
 * and an rpId. None of that is secret, and none of it can sign anything: the
 * key itself never leaves the device, so a stolen localStorage entry is inert.
 */

const STORAGE_KEY = 'pokter.passkey.v1';

/** Which chain the wallet acts on. Mirrors the server's ALTANA_NETWORK. */
export const WALLET_NETWORK =
  process.env.NEXT_PUBLIC_ALTANA_NETWORK === 'bnb' ? BNB : BNB_TESTNET;

export interface StoredWallet {
  address: `0x${string}`;
  credential: PasskeyCredential;
}

export function walletClient() {
  return createClient({ chains: [WALLET_NETWORK] });
}

/**
 * localStorage as an external store, read through useSyncExternalStore.
 *
 * The snapshot is memoised against the raw string so repeated reads return the
 * same object reference — returning a freshly parsed object every call would
 * make React re-render forever, since it compares snapshots by identity.
 */
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: StoredWallet | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing and blocked site data both throw on access.
    return null;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeToWallet(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab writing the same key fires 'storage' here, so a wallet created
  // in one tab shows up in the others.
  window.addEventListener('storage', emit);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', emit);
  };
}

/** Current handle. Stable reference while the underlying string is unchanged. */
export function getStoredWallet(): StoredWallet | null {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedValue;

  cachedRaw = raw;
  cachedValue = null;

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredWallet;
      if (parsed?.address && parsed?.credential) cachedValue = parsed;
    } catch {
      /* a corrupted entry reads as no wallet */
    }
  }

  return cachedValue;
}

/** Server render has no localStorage, and must agree with the first client read. */
export function getServerWallet(): StoredWallet | null {
  return null;
}

export function saveStoredWallet(wallet: StoredWallet): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
  } catch {
    // Not remembered across reloads, but usable for this session.
  }
  emit();
}

export function clearStoredWallet(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
  emit();
}

/** Rebuild a usable signer from a persisted handle. No prompt until it signs. */
export function signerFor(wallet: StoredWallet) {
  return signerFromPasskey(wallet.credential);
}

/** True when this browser can do WebAuthn at all. */
export function passkeysSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    window.isSecureContext
  );
}
