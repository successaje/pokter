'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

import { priceAskAlertsFor, recordPriceAskAlerts, subscribeToPriceAskAlerts, type PriceAskAlert } from '@/lib/agents/price-ask-alerts';
import { useActiveWallet } from '@/lib/wallet/active';

const NONE: PriceAskAlert[] = [];
let cache: { key: string; value: PriceAskAlert[] } | null = null;

/** This wallet's price-ask alerts, newest first, kept in step with the store. */
export function usePriceAskAlerts(): PriceAskAlert[] {
  const { address } = useActiveWallet();
  return useSyncExternalStore(
    subscribeToPriceAskAlerts,
    () => {
      if (!address) return NONE;
      const value = priceAskAlertsFor(address);
      const key = `${address}:${value.length}:${value.filter((a) => !a.readAt).length}`;
      if (cache && cache.key === key) return cache.value;
      cache = { key, value };
      return value;
    },
    () => NONE,
  );
}

/**
 * Turns buyers asking for this wallet's agents' prices into alerts.
 *
 * Mounted in the header beside the request-alert sync, and reads the same
 * list of the wallet's agents (one fetch between them). The counts are
 * public aggregates, re-read every ten minutes while the site is open.
 */
export function usePriceAskAlertSync(): void {
  const { address } = useActiveWallet();
  const agents = useQuery({
    queryKey: ['request-alert-agents', address],
    enabled: Boolean(address),
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Array<{ chainId: number; tokenId: string; name: string }>> => {
      const r = await fetch(`/api/builders/agents?address=${address}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('agents unavailable');
      return ((await r.json()) as { agents: Array<{ chainId: number; tokenId: string; name: string }> }).agents;
    },
  });
  const keys = (agents.data ?? []).slice(0, 50).map((a) => `${a.chainId}:${a.tokenId}`).join(',');
  const counts = useQuery({
    queryKey: ['price-ask-counts', keys],
    enabled: Boolean(address) && keys.length > 0,
    staleTime: 60_000,
    refetchInterval: 10 * 60_000,
    queryFn: async (): Promise<Array<{ chainId: number; tokenId: string; asks: number; latestAt: string }>> => {
      const r = await fetch(`/api/price-asks?agents=${encodeURIComponent(keys)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('price asks unavailable');
      return ((await r.json()) as { counts: Array<{ chainId: number; tokenId: string; asks: number; latestAt: string }> }).counts;
    },
  });
  useEffect(() => {
    if (!address || !agents.data || !counts.data) return;
    const names = new Map(agents.data.map((a) => [`${a.chainId}:${a.tokenId}`, a.name]));
    recordPriceAskAlerts(
      address,
      counts.data.map((c) => ({ ...c, name: names.get(`${c.chainId}:${c.tokenId}`) ?? `Agent #${c.tokenId}` })),
    );
  }, [address, agents.data, counts.data]);
}
