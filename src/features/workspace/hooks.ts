'use client';

import { useSyncExternalStore } from 'react';

import type { HiredJob, JobStatusName } from '@/lib/erc8183/types';
import { isReclaimable } from '@/lib/erc8183/reclaim-gate';
import { jobsForWallet, noJobs, subscribeToJobs } from '@/lib/wallet/activity';
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

/** Jobs this wallet has funded, newest first, as remembered on this device. */
export function useMyJobs(): { jobs: HiredJob[]; address: string | null; ready: boolean } {
  const { address } = useActiveWallet();
  const hydrated = useHydrated();
  const jobs = useSyncExternalStore(
    subscribeToJobs,
    () => (address ? jobsForWallet(address) : noJobs()),
    noJobs,
  );
  return { jobs, address, ready: hydrated };
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

export type JobPhase = 'unfunded' | 'working' | 'review' | 'reclaim' | 'settled' | 'disputed' | 'refunded' | 'expired';

/**
 * The job's state in the buyer's terms. On-chain status names are shown
 * too, but this is what decides what the person is asked to do next.
 */
export function jobPhase(job: HiredJob, now = Date.now()): JobPhase {
  if (job.status === 'OPEN') return 'unfunded';
  if (job.status === 'SUBMITTED') return 'review';
  if (job.status === 'COMPLETED') return 'settled';
  if (job.status === 'REJECTED') return job.reclaimTxHash ? 'refunded' : 'disputed';
  if (job.reclaimTxHash) return 'refunded';
  if (isReclaimable(job, now)) return 'reclaim';
  if (job.status === 'EXPIRED') return 'expired';
  return 'working';
}

export const PHASE: Record<JobPhase, { label: string; tone: 'ok' | 'watch' | 'info' | 'bad' | 'none'; needsYou: boolean; next: string }> = {
  unfunded: { label: 'Not funded', tone: 'none', needsYou: false, next: 'This job was created but never funded. Nothing is held.' },
  working: { label: 'In progress', tone: 'info', needsYou: false, next: 'Escrow is funded. Waiting for the agent to deliver.' },
  review: { label: 'Delivered · review it', tone: 'watch', needsYou: true, next: 'The agent delivered. Check the file, then release payment or dispute it within the window.' },
  reclaim: { label: 'Not delivered · reclaim', tone: 'watch', needsYou: true, next: 'The deadline passed with nothing delivered. Your escrow can be reclaimed.' },
  settled: { label: 'Settled', tone: 'ok', needsYou: false, next: 'Payment was released to the agent.' },
  disputed: { label: 'Disputed', tone: 'bad', needsYou: false, next: 'You contested the delivery. The policy’s voters decide whether the escrow is refunded.' },
  refunded: { label: 'Refunded', tone: 'none', needsYou: false, next: 'The escrow was returned to your wallet.' },
  expired: { label: 'Expired', tone: 'none', needsYou: false, next: 'The job expired.' },
};

export const STATUS_NAME: Record<JobStatusName, string> = {
  OPEN: 'Open',
  FUNDED: 'Funded',
  SUBMITTED: 'Submitted',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};
