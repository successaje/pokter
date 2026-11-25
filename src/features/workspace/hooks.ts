'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getErc8183Job, getErc8183JobPaymentToken } from '@/lib/erc8183/job-read-browser';
import type { HiredJob, JobStatusName } from '@/lib/erc8183/types';
import { checkedSavedJob, savedJobMismatch } from '@/lib/jobs/record-match';
import { jobsForWallet, noJobs, subscribeToJobs, updateRememberedJob } from '@/lib/wallet/activity';
import { walletNetworkFor } from '@/lib/wallet/passkey';
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
  /*
   * Hires only this browser knows of are checked against the escrow once:
   * a number saved before the chain settled can be another job's, whose
   * status would otherwise stand in for this hire's (`checkedSavedJob`).
   * The index's own rows are read from chain already. The answer is
   * written back to this browser's record, which re-renders the list.
   */
  const savedOnly = useMemo(() => {
    const inIndex = new Set((indexed.data ?? []).map((j) => `${j.chainId}:${j.jobId}`));
    return stored.filter((j) => !inIndex.has(`${j.chainId}:${j.jobId}`)).slice(0, 20);
  }, [stored, indexed.data]);
  useQuery({
    queryKey: ['saved-job-numbers', address?.toLowerCase(), savedOnly.map((j) => `${j.chainId}:${j.jobId}:${j.paymentToken ?? ''}:${j.numberMismatch ? 1 : 0}`).join(',')],
    enabled: Boolean(address) && indexed.isSuccess && savedOnly.length > 0,
    staleTime: 10 * 60_000,
    retry: 0,
    queryFn: async () => {
      const checkedAt = new Date().toISOString();
      for (const job of savedOnly) {
        const network = walletNetworkFor(job.chainId);
        const onchain = await getErc8183Job(network, BigInt(job.jobId)).catch(() => null);
        /* Unread is not a verdict: the record stays as it is until the chain answers. */
        if (!onchain) continue;
        const token = !job.paymentToken && !savedJobMismatch(onchain, job, checkedAt) ? await getErc8183JobPaymentToken(network, BigInt(job.jobId)) : null;
        const next = checkedSavedJob(job, onchain, token, checkedAt);
        if (next && address) updateRememberedJob(address, next);
      }
      return checkedAt;
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
