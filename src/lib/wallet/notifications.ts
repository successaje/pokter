'use client';

import type { HiredJob, JobStatusName } from '@/lib/erc8183/types';

const SETTINGS_KEY = 'pokter.notifications.settings.v1';
const INBOX_KEY = 'pokter.notifications.inbox.v1';
const EVENT_NAME = 'pokter:notifications-changed';

export interface NotificationSettings {
  walletAddress: string;
  inApp: boolean;
  browser: boolean;
  jobIds: string[];
}

export interface ActivityNotification {
  id: string;
  walletAddress: string;
  jobId: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  status: JobStatusName;
}

const STATUS_COPY: Record<JobStatusName, { title: string; body: (job: HiredJob) => string }> = {
  OPEN: { title: 'Job opened', body: (job) => `Job #${job.jobId} is ready to be funded.` },
  FUNDED: { title: 'Escrow funded', body: (job) => `Job #${job.jobId} is funded and waiting for ${job.agentName}.` },
  SUBMITTED: { title: 'Delivery ready', body: (job) => `${job.agentName} submitted work for job #${job.jobId}.` },
  COMPLETED: { title: 'Job completed', body: (job) => `Job #${job.jobId} is complete and the provider was paid.` },
  REJECTED: { title: 'Delivery contested', body: (job) => `Job #${job.jobId} needs your attention.` },
  EXPIRED: { title: 'Job expired', body: (job) => `Job #${job.jobId} expired without a completed delivery.` },
};

function readArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function emit(): void {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function notificationSettings(walletAddress: string): NotificationSettings {
  const wallet = walletAddress.toLowerCase();
  return readArray<NotificationSettings>(SETTINGS_KEY).find(
    (entry) => entry.walletAddress.toLowerCase() === wallet,
  ) ?? { walletAddress, inApp: true, browser: false, jobIds: [] };
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  const wallet = settings.walletAddress.toLowerCase();
  const others = readArray<NotificationSettings>(SETTINGS_KEY).filter(
    (entry) => entry.walletAddress.toLowerCase() !== wallet,
  );
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify([settings, ...others]));
  emit();
}

export function notificationsForWallet(walletAddress: string): ActivityNotification[] {
  const wallet = walletAddress.toLowerCase();
  return readArray<ActivityNotification>(INBOX_KEY).filter(
    (entry) => entry.walletAddress.toLowerCase() === wallet,
  );
}

export function recordJobNotification(
  walletAddress: string,
  job: HiredJob,
  previousStatus?: JobStatusName,
): void {
  if (previousStatus === job.status) return;
  const settings = notificationSettings(walletAddress);
  if (!settings.inApp && !settings.browser) return;
  if (settings.jobIds.length > 0 && !settings.jobIds.includes(job.jobId)) return;

  const id = `${walletAddress.toLowerCase()}:${job.chainId}:${job.jobId}:${job.status}`;
  const existing = readArray<ActivityNotification>(INBOX_KEY);
  if (existing.some((entry) => entry.id === id)) return;
  const copy = STATUS_COPY[job.status];
  const item: ActivityNotification = {
    id,
    walletAddress,
    jobId: job.jobId,
    title: copy.title,
    body: copy.body(job),
    createdAt: new Date().toISOString(),
    readAt: null,
    status: job.status,
  };
  window.localStorage.setItem(INBOX_KEY, JSON.stringify([item, ...existing].slice(0, 100)));
  emit();

  if (settings.browser && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(item.title, { body: item.body, tag: id });
  }
}

export function markNotificationRead(id: string): void {
  const next = readArray<ActivityNotification>(INBOX_KEY).map((entry) =>
    entry.id === id && !entry.readAt ? { ...entry, readAt: new Date().toISOString() } : entry,
  );
  window.localStorage.setItem(INBOX_KEY, JSON.stringify(next));
  emit();
}

export function markAllNotificationsRead(walletAddress: string): void {
  const wallet = walletAddress.toLowerCase();
  const now = new Date().toISOString();
  const next = readArray<ActivityNotification>(INBOX_KEY).map((entry) =>
    entry.walletAddress.toLowerCase() === wallet && !entry.readAt
      ? { ...entry, readAt: now }
      : entry,
  );
  window.localStorage.setItem(INBOX_KEY, JSON.stringify(next));
  emit();
}

export function subscribeToNotifications(listener: () => void): () => void {
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener('storage', listener);
  };
}
