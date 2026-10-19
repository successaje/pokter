'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';

import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { AgentAvatar } from '@/ui/Agent';

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
export function HireSheet({
  fullPageHref,
  agent,
  children,
}: {
  fullPageHref: string;
  agent: { name: string; imageUrl: string | null; seed: string; subline: string };
  children: ReactNode;
}) {
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
      icon={<AgentAvatar name={agent.name} imageUrl={agent.imageUrl} seed={agent.seed} size={36} />}
      title={`Hire ${agent.name}`}
      /* What it costs and where it settles, not a paragraph about escrow:
         the flow says all of that where it applies, and a sheet header is
         read once on the way past. */
      description={agent.subline}
      className="sm:max-w-[min(680px,94vw)]"
      /*
       * No footer. The bottom edge belongs to the step's own action - Review
       * terms, then Continue to payment, then Fund escrow - which is the
       * thing a reader is reaching for and which used to sit at the end of a
       * scroll. "Open as a page" is a way out, not a next step, so it moves
       * up beside Close where the other ways out are.
       */
      headerAction={
        <a href={fullPageHref} className="grid size-9 place-items-center rounded-[8px] text-ink-3 hover:bg-sunken hover:text-ink" title="Open as a page" aria-label="Open as a page">
          <Icon.ArrowUpRight size={16} />
        </a>
      }
    >
      {children}
    </Sheet>
  );
}
