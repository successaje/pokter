'use client';

import { useSyncExternalStore } from 'react';

import { LEGACY_PASSKEY_CHAIN, passkeyActionChains, type PasskeyChainId } from './passkey-networks';

/*
 * Which of a passkey wallet's networks the shell shows: its balances and the
 * send form. Only a wallet that acts on more than one network has a choice;
 * otherwise it is the one network it acts on. Held in memory for the page's
 * life and shared by every `useWalletState`, so the menu and the wallet page
 * never show different networks.
 */
let chosen: PasskeyChainId | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function choosePasskeyChain(chainId: PasskeyChainId): void {
  chosen = chainId;
  for (const listener of listeners) listener();
}

/** The network to show for this wallet: the one chosen, if it acts there, else its first. */
export function usePasskeyViewChain(wallet: { chains: readonly number[] } | null): PasskeyChainId {
  const pick = useSyncExternalStore(subscribe, () => chosen, () => null);
  const acts = passkeyActionChains(wallet);
  return pick !== null && acts.includes(pick) ? pick : (acts[0] ?? LEGACY_PASSKEY_CHAIN);
}
