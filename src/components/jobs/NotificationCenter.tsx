'use client';

import { useEffect, useState } from 'react';

import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationSettings,
  notificationsForWallet,
  saveNotificationSettings,
  subscribeToNotifications,
  type ActivityNotification,
} from '@/lib/wallet/notifications';

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}

export function NotificationCenter({ walletAddress }: { walletAddress: string }) {
  const [items, setItems] = useState<ActivityNotification[]>([]);
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    const refresh = () => {
      setItems(notificationsForWallet(walletAddress));
      setBrowserEnabled(notificationSettings(walletAddress).browser);
      setPermission('Notification' in window ? Notification.permission : 'unsupported');
    };
    refresh();
    return subscribeToNotifications(refresh);
  }, [walletAddress]);

  const toggleBrowser = async () => {
    if (!('Notification' in window)) return;
    let nextPermission = Notification.permission;
    if (!browserEnabled && nextPermission === 'default') {
      nextPermission = await Notification.requestPermission();
    }
    const enabled = !browserEnabled && nextPermission === 'granted';
    saveNotificationSettings({
      ...notificationSettings(walletAddress),
      browser: enabled,
    });
    setPermission(nextPermission);
  };

  const unread = items.filter((item) => !item.readAt).length;

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3">
          <div>
            <h3 className="text-sm font-medium">Job updates</h3>
            <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">
              {unread ? `${unread} unread` : 'You are caught up'}
            </p>
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAllNotificationsRead(walletAddress)}
              className="text-[11px] font-medium text-[color:var(--info)] hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>

        {items.length ? (
          <div className="divide-y divide-[color:var(--border)]">
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => markNotificationRead(item.id)}
                className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--surface-hover)]"
              >
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? 'bg-[color:var(--border-strong)]' : 'bg-[color:var(--brand)]'}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium">{item.title}</span>
                    <span className="text-[10px] text-[color:var(--text-faint)]">{timeLabel(item.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                    {item.body}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-[12px] text-[color:var(--text-muted)]">
            Updates appear here after you commission or recover a job.
          </p>
        )}
      </div>

      <aside className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
        <h3 className="text-sm font-medium">How to notify me</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
          In-app updates stay on this device. Browser alerts add a system notification when Pokter is open.
        </p>
        <button
          type="button"
          disabled={permission === 'unsupported' || permission === 'denied'}
          onClick={toggleBrowser}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>
            <span className="block text-[12px] font-medium">Browser alerts</span>
            <span className="mt-0.5 block text-[10px] text-[color:var(--text-faint)]">
              {permission === 'denied' ? 'Blocked in browser settings' : browserEnabled ? 'Enabled' : 'Off'}
            </span>
          </span>
          <span className={`relative h-5 w-9 rounded-full transition-colors ${browserEnabled ? 'bg-[color:var(--brand)]' : 'bg-[color:var(--border-strong)]'}`}>
            <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${browserEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
          </span>
        </button>
        <p className="mt-3 text-[10px] leading-relaxed text-[color:var(--text-faint)]">
          Email is intentionally not collected until verified delivery and one-click unsubscribe are available.
        </p>
      </aside>
    </section>
  );
}
