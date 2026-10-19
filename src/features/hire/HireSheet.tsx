'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';

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
 * catalogue is still underneath with its scroll position. A shared link
 * or a refresh loads /hire standalone.
 *
 * Nothing here cancels a transaction in flight. Once a wallet has been
 * asked to sign, that lives in the wallet; closing the sheet only stops
 * watching, exactly as navigating away from the page would.
 */
export function HireSheet({ agent, children }: { agent: { name: string }; children: ReactNode }) {
  const router = useRouter();
  /*
   * Dismiss first, navigate after.
   *
   * Closing used to be `router.back()` alone, which meant the sheet stayed
   * on screen until the route behind it was ready to render. Warm that is
   * 70ms and invisible; cold - a router cache that has expired, a slow
   * connection, a dev rebuild - it is however long that page takes, and the
   * one thing a person wants after pressing an X is for the thing to go.
   *
   * The two are independent: this hides the dialog immediately, and the
   * history pop that follows is what actually unmounts it and restores the
   * address.
   */
  const [open, setOpen] = useState(true);
  const close = useCallback(() => {
    setOpen(false);
    router.back();
  }, [router]);
  return (
    <Sheet
      open={open}
      onClose={close}
      floating
      /* The title and a way out, nothing else. The avatar, the price line
         and "Open as a page" sat here as well; the price went stale the
         moment the form switched network, and the rest repeated what the
         page behind the sheet already says. */
      title={`Hire ${agent.name}`}
      className="sm:max-w-[min(680px,94vw)]"
    >
      {children}
    </Sheet>
  );
}
