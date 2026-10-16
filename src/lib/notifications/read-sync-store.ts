'use client';

import { readTokenUsable } from './read-state';

/**
 * This device's permission to move the inbox read marker.
 *
 * Kept in `localStorage`, which is where a bearer token is least pleasant
 * to keep — and acceptable only because of what this one can do. It
 * moves a read marker. It cannot send mail, change an address, read a job
 * or touch an escrow, and anything able to read it already has the page.
 *
 * Per wallet and chain, because the proof it came from was.
 */
const KEY = 'pokter.notifications.readsync.v1';

export interface ReadSyncToken {
  wallet: string;
  chainId: number;
  token: string;
  expiresAt: string;
}

function all(): ReadSyncToken[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as ReadSyncToken[]) : [];
  } catch {
    /* Blocked, cleared or private: the device simply is not syncing. */
    return [];
  }
}

function write(tokens: ReadSyncToken[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(tokens));
  } catch {
    /* Kept for this page only. */
  }
}

function matches(entry: ReadSyncToken, wallet: string, chainId: number): boolean {
  return entry.wallet.toLowerCase() === wallet.toLowerCase() && entry.chainId === chainId;
}

/** The usable token for this wallet and chain, if there is one. */
export function readSyncToken(wallet: string | null, chainId: number): ReadSyncToken | null {
  if (!wallet) return null;
  const found = all().find((entry) => matches(entry, wallet, chainId));
  return found && readTokenUsable(found) ? found : null;
}

export function saveReadSyncToken(entry: ReadSyncToken): void {
  write([...all().filter((other) => !matches(other, entry.wallet, entry.chainId)), entry]);
}

export function forgetReadSyncToken(wallet: string, chainId: number): void {
  write(all().filter((other) => !matches(other, wallet, chainId)));
}
