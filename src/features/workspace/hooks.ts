'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { HiredJob, JobStatusName } from '@/lib/erc8183/types';
import { jobsForWallet, noJobs, subscribeToJobs } from '@/lib/wallet/activity';
import { mergeWalletJobs } from './merge-jobs';
import { notificationsForWallet, subscribeToNotifications, type ActivityNotification } from '@/lib/wallet/notifications';
import {
  readSavedAgentAlerts,
  readSavedAgents,
  subscribeToSavedAgents,
  type SavedAgent,
  type SavedAgentAlert,
} from '@/lib/wallet/saved-agents';
import { useActiveWallet } from '@/lib/wallet/active';
import { useHydrated } from '@/lib/ui/use-hydrated';

const NO_NOTES: ActivityNotification[] = [];
const NO_SAVED: SavedAgent[] = [];
const NO_ALERTS: SavedAgentAlert[] = [];

/**
 * Jobs this wallet has funded, newest first: the ones remembered on this
 * device, plus any Pokter's index has for the same wallet, so a hire made
 * in another browser shows up here too. The device's copy wins where both
 * have a job, because it holds the brief and the latest local actions,
 * except for the job's token, which the index reads from the escrow.
 */
export function useMyJobs(): { jobs: HiredJob[]; address: string | null; ready: boolean; failed: boolean; retry: () => void } {
  const { address } = useActiveWallet();
  const hydrated = useHydrated();
  const stored = useSyncExternalStore(
    subscribeToJobs,
    () => (address ? jobsForWallet(address) : noJobs()),
    noJobs,
  );
  const indexed = useQuery({
    queryKey: ['jobs-by-client', address?.toLowerCase()],
    enabled: Boolean(address),
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<HiredJob[]> => {
      const response = await fetch(`/api/jobs?client=${address}`);
      /* A failed read is a failure, not an empty record: "No jobs yet" must never stand for "could not load". */
      if (!response.ok) throw new Error(`Pokter's job record answered ${response.status}`);
      return ((await response.json()) as { jobs?: HiredJob[] }).jobs ?? [];
    },
  });
  const jobs = useMemo(() => mergeWalletJobs(stored, indexed.data ?? []), [stored, indexed.data]);
  return {
    jobs,
    address,
    ready: hydrated && (!address || !indexed.isPending),
    failed: indexed.isError,
    retry: () => void indexed.refetch(),
  };
}

let notesCache: { key: string; raw: ActivityNotification[] } | null = null;
export function useInbox(): ActivityNotification[] {
  const { address } = useActiveWallet();
  return useSyncExternalStore(
    subscribeToNotifications,
    () => {
      if (!address) return NO_NOTES;
      const raw = notificationsForWallet(address);
      const key = `${address}:${raw.length}:${raw.filter((n) => !n.readAt).length}`;
      if (notesCache && notesCache.key === key) return notesCache.raw;
      notesCache = { key, raw };
      return raw;
    },
    () => NO_NOTES,
  );
}

let savedCache: { raw: string; value: SavedAgent[] } | null = null;
export function useSavedAgents(): SavedAgent[] {
  return useSyncExternalStore(
    subscribeToSavedAgents,
    () => {
      const value = readSavedAgents();
      const raw = JSON.stringify(value);
      if (savedCache && savedCache.raw === raw) return savedCache.value;
      savedCache = { raw, value };
      return value;
    },
    () => NO_SAVED,
  );
}

let alertsCache: { raw: string; value: SavedAgentAlert[] } | null = null;
export function useSavedAlerts(): SavedAgentAlert[] {
  return useSyncExternalStore(
    subscribeToSavedAgents,
    () => {
      const value = readSavedAgentAlerts();
      const raw = JSON.stringify(value);
      if (alertsCache && alertsCache.raw === raw) return alertsCache.value;
      alertsCache = { raw, value };
      return value;
    },
    () => NO_ALERTS,
  );
}

export { jobPhase, PHASE, type JobPhase } from './phase';

export const STATUS_NAME: Record<JobStatusName, string> = {
  OPEN: 'Open',
  FUNDED: 'Funded',
  SUBMITTED: 'Submitted',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};

/** The time the view was opened, fixed for the render so phases cannot flicker mid-paint. */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
