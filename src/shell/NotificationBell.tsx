'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

import { jobHref } from '@/lib/jobs/href';
import { ESCROW_CHAIN } from '@/lib/wallet/config';
import { markAllNotificationsRead, markNotificationRead } from '@/lib/wallet/notifications';
import { markSavedAgentAlertsRead } from '@/lib/wallet/saved-agents';
import { useActiveWallet } from '@/lib/wallet/active';
import { useDismissibleLayer } from '@/lib/ui/useDismissibleLayer';
import { cn } from '@/lib/ui/cn';
import { useInbox, useSavedAlerts } from '@/features/workspace/hooks';
import { useRequestAlerts, useRequestAlertSync } from '@/features/briefs/useRequestAlerts';
import { markRequestAlertRead, markRequestAlertsRead } from '@/lib/briefs/request-alerts';
import { markPriceAskAlertRead, markPriceAskAlertsRead, priceAskHref } from '@/lib/agents/price-ask-alerts';
import { usePriceAskAlerts, usePriceAskAlertSync } from '@/features/agent/usePriceAskAlerts';
import { useReadSync } from '@/features/workspace/useReadSync';
import { Icon } from '@/ui/icons';

/**
 * The unread count, where somebody will see it.
 *
 * The Inbox page already held every note, with read state and links. What
 * was missing was any sign of it from elsewhere: a buyer whose review
 * window was closing had to think to go and look. This reads the same two
 * sources the page does rather than keeping a second list, which is the
 * difference between a count that agrees with the page and one that drifts
 * from it.
 *
 * Unread is not the same as unresolved, and the two are deliberately not
 * merged here: reading a note never marks the job behind it done. The badge
 * counts what has not been read; "Needs you" on the overview counts what
 * still has to be acted on.
 */
export function NotificationBell() {
  const notes = useInbox();
  const alerts = useSavedAlerts();
  /* Requests that fit this wallet's agents: synced here because the header is on every page. */
  useRequestAlertSync();
  const requestAlerts = useRequestAlerts();
  /* Buyers asking for the price of an agent this wallet owns that cannot be priced. */
  usePriceAskAlertSync();
  const priceAskAlerts = usePriceAskAlerts();
  const { address } = useActiveWallet();
  /*
   * The same read state the page uses, for the same reason it reads the
   * same two sources: a badge that disagrees with the list it points at is
   * worse than no badge.
   */
  const sync = useReadSync();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const layer = useDismissibleLayer<HTMLDivElement>({ open, onDismiss: close });

  const items = [
    ...notes.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      at: n.createdAt,
      read: sync.isRead(n),
      /*
       * The canonical builder, not a hand-rolled path: the same job number
       * can exist on both chains, and a link that drops the chain opens the
       * wrong job.
       */
      href: jobHref({ jobId: n.jobId, chainId: n.chainId ?? ESCROW_CHAIN.id }),
    })),
    ...alerts.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      at: a.createdAt,
      read: sync.isRead(a),
      href: `/agents/${a.agentId.replace(':', '/')}`,
    })),
    ...requestAlerts.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      at: r.createdAt,
      read: sync.isRead(r),
      href: `/requests/${r.requestId}`,
    })),
    ...priceAskAlerts.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      at: p.createdAt,
      read: sync.isRead(p),
      href: priceAskHref(p),
    })),
  ].sort((x, y) => Date.parse(y.at) - Date.parse(x.at));

  const unread = items.filter((i) => !i.read).length;

  // Nothing to show and nothing to count: no wallet, no notes.
  if (!address) return null;

  return (
    <div ref={layer} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative grid size-9 place-items-center rounded-[8px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
      >
        <Icon.Bell size={18} aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute right-1 top-1 min-w-[16px] rounded-full bg-watch px-1 text-center text-[10px] font-semibold leading-4 text-paper"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="anim-rise absolute right-0 top-[calc(100%+8px)] z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[14px] border border-rule bg-raised shadow-float"
        >
          <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
            <span className="t-label">{unread > 0 ? `${unread} unread` : 'Notifications'}</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (address) markAllNotificationsRead(address);
                  /*
                   * Saved-agent alerts too. The badge beside this counts
                   * both, so clearing only one kind left a count that
                   * disagreed with the button that had just been pressed.
                   */
                  markSavedAgentAlertsRead();
                  if (address) markRequestAlertsRead(address);
                  if (address) markPriceAskAlertsRead(address);
                  sync.markSeen([...notes, ...alerts, ...requestAlerts, ...priceAskAlerts]);
                }}
                className="text-[12.5px] font-medium text-ink-3 hover:text-ink"
              >
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-ink-3">
              Nothing yet. Updates about your jobs, and requests your agents could answer, appear here.
            </p>
          ) : (
            <ul className="max-h-[22rem] divide-y divide-rule overflow-y-auto">
              {items.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => {
                      markNotificationRead(item.id);
                      markRequestAlertRead(item.id);
                      markPriceAskAlertRead(item.id);
                      close();
                    }}
                    className={cn('flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-sunken', !item.read && 'bg-sunken/40')}
                  >
                    <span className="flex items-start gap-2">
                      {!item.read && <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-watch" />}
                      <span className="text-[13.5px] font-medium">{item.title}</span>
                    </span>
                    <span className="line-clamp-2 pl-3.5 text-[12.5px] leading-snug text-ink-3">{item.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-rule px-4 py-2.5">
            <Link href="/workspace/inbox" onClick={close} className="text-[13px] font-medium hover:underline">
              Open the inbox
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
