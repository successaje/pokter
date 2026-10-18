'use client';

import { useRouter } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';

import { buttonClass } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';

/**
 * The hire flow over the page it was opened from.
 *
 * `(flow)` gives the standalone page no site navigation, on the grounds
 * that there is nowhere to wander off to mid-payment. A sheet keeps that
 * property by other means: the page behind it is inert and dimmed, and the
 * only ways out are the ones drawn here.
 *
 * Closing is `router.back()`, so the browser's Back closes it and the
 * catalogue is still underneath with its scroll position. "Open as a page"
 * is a plain anchor, a real load, so /hire renders standalone — which is
 * also what a shared link and a refresh get.
 *
 * Nothing here cancels a transaction in flight. Once a wallet has been
 * asked to sign, that lives in the wallet; closing the sheet only stops
 * watching, exactly as navigating away from the page would.
 */
export function HireSheet({ fullPageHref, children }: { fullPageHref: string; children: ReactNode }) {
  const router = useRouter();
  const close = useCallback(() => router.back(), [router]);
  return (
    <Sheet
      open
      onClose={close}
      floating
      title="Hire this agent"
      description="Pokter holds the money in escrow and releases it when you accept the work. One job, one escrow; no standing access to your wallet."
      className="sm:max-w-[min(680px,94vw)]"
      footer={
        <div className="flex items-center justify-between gap-3 pb-3">
          <button type="button" onClick={close} className="text-[13px] font-medium text-ink-2 hover:text-ink">
            Close
          </button>
          <a href={fullPageHref} className={buttonClass('secondary', 's')}>
            Open as a page <Icon.ArrowUpRight size={14} />
          </a>
        </div>
      }
    >
      {children}
    </Sheet>
  );
}
