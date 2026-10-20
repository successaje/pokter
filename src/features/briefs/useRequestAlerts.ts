'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

import { matchRequests, type MatchableAgent, type MatchableRequest } from '@/lib/briefs/matching';
import { recordRequestAlerts, requestAlertsFor, subscribeToRequestAlerts, type RequestAlert } from '@/lib/briefs/request-alerts';
import { useActiveWallet } from '@/lib/wallet/active';

const NONE: RequestAlert[] = [];
let cache: { key: string; value: RequestAlert[] } | null = null;

/** This wallet's request alerts, newest first, kept in step with the store. */
export function useRequestAlerts(): RequestAlert[] {
  const { address } = useActiveWallet();
  return useSyncExternalStore(
    subscribeToRequestAlerts,
    () => {
      if (!address) return NONE;
      const value = requestAlertsFor(address);
      const key = `${address}:${value.length}:${value.filter((a) => !a.readAt).length}`;
      if (cache && cache.key === key) return cache.value;
      cache = { key, value };
      return value;
    },
    () => NONE,
  );
}

/**
 * Turns new requests that fit this wallet's agents into alerts.
 *
 * Mounted once, in the header, so it runs on whatever page the builder is
 * on. The requests are re-read every few minutes while the site is open;
 * the wallet's agents change rarely and are read once in a while. Nothing
 * is sent anywhere: matching happens here, from two public lists, and the
 * alerts stay in this browser like the rest of the inbox.
 */
export function useRequestAlertSync(): void {
  const { address } = useActiveWallet();

  const agents = useQuery({
    queryKey: ['request-alert-agents', address],
    enabled: Boolean(address),
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<MatchableAgent[]> => {
      const r = await fetch(`/api/builders/agents?address=${address}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('agents unavailable');
      return ((await r.json()) as { agents: MatchableAgent[] }).agents;
    },
  });

  const hasCategorised = Boolean(agents.data?.some((a) => a.categoryId));
  const requests = useQuery({
    queryKey: ['open-requests'],
    /* No listed agent in a category, nothing could match: do not poll for it. */
    enabled: Boolean(address) && hasCategorised,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<MatchableRequest[]> => {
      const r = await fetch('/api/briefs', { cache: 'no-store' });
      if (!r.ok) throw new Error('requests unavailable');
      return ((await r.json()) as { briefs: MatchableRequest[] }).briefs;
    },
  });

  useEffect(() => {
    if (!address || !agents.data || !requests.data) return;
    recordRequestAlerts(address, matchRequests(requests.data, agents.data, address));
  }, [address, agents.data, requests.data]);
}
