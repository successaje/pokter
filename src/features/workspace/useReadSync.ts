'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount } from 'wagmi';

import { isEscrowChain } from '@/lib/network/escrow';
import { CHAIN_ID } from '@/lib/network/presentation';
import {
  forgetReadSyncToken, readSyncToken, saveReadSyncToken,
} from '@/lib/notifications/read-sync-store';
import {
  itemRead, watermarkFor, type ReadableItem, type Watermark,
} from '@/lib/notifications/read-state';
import { useActiveWallet } from '@/lib/wallet/active';
import { useHydrated } from '@/lib/ui/use-hydrated';
import { useLiveSignMessage } from '@/lib/wallet/use-live-sign-message';

/**
 * Read state that follows a buyer between their devices.
 *
 * The inbox is derived from job state on chain, so a phone and a laptop
 * build the same list; the only thing that never travelled was whether
 * either of them had been looked at. One watermark now does.
 *
 * Opt-in, and signed for once. Moving the marker can hide an unread
 * "delivery ready" badge, which is how a review window gets missed, so it
 * cannot be something a stranger does by knowing a public address. Until a
 * buyer turns it on, everything behaves exactly as it did: read state stays
 * on the device that did the reading.
 */
export function useReadSync() {
  const hydrated = useHydrated();
  const { address, mode } = useActiveWallet();
  const { chain } = useAccount();
  const { signMessageAsync } = useLiveSignMessage();
  const queryClient = useQueryClient();
  const chainId = chain && isEscrowChain(chain.id) ? chain.id : CHAIN_ID;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Read at render rather than copied into state by an effect, so the
   * first paint after hydration is already right.
   */
  const stored = hydrated ? readSyncToken(address, chainId) : null;

  const remote = useQuery({
    queryKey: ['read-sync', address, chainId, stored?.token ?? null],
    enabled: Boolean(stored),
    staleTime: 30_000,
    queryFn: async (): Promise<Watermark | null> => {
      const response = await fetch('/api/notifications/read-state', {
        headers: { authorization: `Bearer ${stored!.token}` },
      });
      if (!response.ok) return null;
      return ((await response.json()) as { watermark: Watermark | null }).watermark;
    },
  });

  const post = async (body: unknown, token?: string) => {
    const response = await fetch('/api/notifications/read-state', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'That did not go through.');
    return payload;
  };

  const enable = useCallback(async () => {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const issued = await post({ action: 'challenge', wallet: address, chainId });
      const challenge = issued.challenge as { challengeId: string; message: string };
      const signature = await signMessageAsync({ message: challenge.message });
      const granted = await post({ action: 'enable', wallet: address, chainId, challengeId: challenge.challengeId, signature });
      saveReadSyncToken({
        wallet: address, chainId,
        token: String(granted.token), expiresAt: String(granted.expiresAt),
      });
      await queryClient.invalidateQueries({ queryKey: ['read-sync'] });
    } catch (caught) {
      const message = (caught as Error).message || 'Syncing could not be turned on.';
      setError(/reject|denied|cancel/i.test(message) ? 'Cancelled in the wallet. Nothing changed.' : message);
    } finally {
      setBusy(false);
    }
  }, [address, chainId, queryClient, signMessageAsync]);

  const disable = useCallback(async () => {
    if (!address || !stored) return;
    setBusy(true);
    setError(null);
    try {
      await post({ action: 'disable' }, stored.token);
    } catch {
      /*
       * The server may already have dropped it. Forgetting it locally is
       * the part that has to happen either way, or the device would keep
       * presenting a token it has been told to stop using.
       */
    } finally {
      forgetReadSyncToken(address, chainId);
      await queryClient.invalidateQueries({ queryKey: ['read-sync'] });
      setBusy(false);
    }
  }, [address, chainId, queryClient, stored]);

  /**
   * Mark what is in the inbox now as seen.
   *
   * Takes the newest item's own timestamp, never the clock, so work that
   * arrives while the page is open stays unread. Fire-and-forget: a failed
   * sync must not stop the page from working.
   */
  const markSeen = useCallback((items: readonly ReadableItem[]) => {
    const mark = watermarkFor(items);
    if (!mark || !stored) return;
    void post({ action: 'seen', seenThrough: mark.seenThrough }, stored.token)
      .then((payload) => queryClient.setQueryData(
        ['read-sync', address, chainId, stored.token],
        (payload.watermark as Watermark | null) ?? mark,
      ))
      .catch(() => {
        /* The device keeps its own read marks; the shared one catches up later. */
      });
  }, [address, chainId, queryClient, stored]);

  const watermark = remote.data ?? null;

  return {
    /** Whether this device is sharing read state. */
    syncing: Boolean(stored),
    /** A passkey wallet cannot sign a plain message yet, so it cannot opt in. */
    available: mode === 'external',
    watermark,
    /** Whether an item counts as read, by the watermark or this device's own note. */
    isRead: useCallback((item: ReadableItem) => itemRead(item, watermark), [watermark]),
    enable,
    disable,
    markSeen,
    busy,
    error,
  };
}
