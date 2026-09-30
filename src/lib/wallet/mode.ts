'use client';

import { useSyncExternalStore } from 'react';

export type WalletMode = 'passkey' | 'external';

const STORAGE_KEY = 'pokter.wallet-mode.v1';

/**
 * Which wallet the buyer is hiring with.
 *
 * Hiring used to be two panels: the passkey flow inside the wallet gate, and
 * an external-wallet panel below it doing the same job with different words.
 * That made the choice a thing to read about rather than a switch to flip, and
 * it meant the commission form only ever spoke to one of them.
 *
 * The mode lives here so the form can ask what it is signing with instead of
 * being duplicated per wallet. Persisted, because a buyer who has chosen their
 * wallet once should not be asked again on the next agent.
 *
 * Written through the same external-store pattern the passkey wallet uses:
 * localStorage read via useSyncExternalStore, so the first render already has
 * the right answer rather than flashing the default and correcting it.
 */
const listeners = new Set<() => void>();
let cached: WalletMode | null = null;

function read(): WalletMode {
  if (cached !== null) return cached;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cached = raw === 'external' ? 'external' : 'passkey';
  } catch {
    // Private browsing and blocked site data both throw on access.
    cached = 'passkey';
  }
  return cached;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setWalletMode(mode: WalletMode): void {
  cached = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /*
     * The in-memory value above is already set, so the switch still works for
     * this session. Silently doing nothing would have made the control look
     * broken in a private window.
     */
  }
  for (const listener of listeners) listener();
}

export function useWalletMode(): WalletMode {
  return useSyncExternalStore(subscribe, read, () => 'passkey');
}
