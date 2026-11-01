'use client';

import { useState, type ReactNode } from 'react';

import type { ProposalPrefill } from '@/lib/briefs/public-view';
import { useActiveWallet } from '@/lib/wallet/active';
import { Button, LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { NetworkTag } from '@/ui/Network';
import { ProposalForm, type ProposalRequest } from './ProposalForm';

/**
 * A request's page: the request on the left, a summary card on the right.
 *
 * The card holds the terms a builder prices against — budget first, then
 * when it was posted, the network, delivery, when proposals close — and
 * one action. Making a proposal swaps the card for the form in place, so
 * the request stays readable beside it; Back returns to the summary.
 * The poster sees the summary without the action: nobody proposes to
 * their own request. Once it has ended without a hire, closed or
 * withdrawn, the poster's action is to post it again.
 *
 * On a phone the card sits under the title rather than below everything,
 * so the budget and the action are where a reader decides.
 */
export function RequestDetail({
  request,
  taking,
  ended = false,
  head,
  summary,
  children,
  prefill = null,
}: {
  request: ProposalRequest;
  taking: boolean;
  /** Closed or withdrawn, with nobody hired: what the poster may want to post again. */
  ended?: boolean;
  head: ReactNode;
  summary: ReactNode;
  children: ReactNode;
  /** A proposal prepared elsewhere, read from the page's link: the form opens with it. */
  prefill?: (Omit<ProposalPrefill, 'deliverDays'> & { deliverDays: number | null }) | null;
}) {
  const { address } = useActiveWallet();
  const isPoster = Boolean(address && address.toLowerCase() === request.poster.toLowerCase());
  const canPropose = taking && !isPoster;
  const [proposing, setProposing] = useState(Boolean(prefill));

  return (
    <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr] lg:gap-x-12">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">{head}</div>

      <aside aria-label={proposing ? 'Make a proposal' : 'Request summary'} className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="flex flex-col gap-5 rounded-[18px] border border-rule bg-raised p-5 shadow-lift sm:p-6 lg:sticky lg:top-24">
          {proposing && canPropose ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Make a proposal</h2>
                  {/* The same Mainnet or Testnet tag as the request's card and the summary; the form's budget line names the money. */}
                  <NetworkTag chainId={request.chainId} className="self-start" />
                </div>
                <button type="button" onClick={() => setProposing(false)} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[8px] px-2 text-[13px] text-ink-3 hover:bg-sunken hover:text-ink">
                  <Icon.ChevronLeft size={14} aria-hidden /> Summary
                </button>
              </div>
              <ProposalForm request={request} prefill={prefill} />
            </>
          ) : (
            <>
              {summary}
              {canPropose ? (
                <div className="flex flex-col gap-2">
                  <Button onClick={() => setProposing(true)} trailing={<Icon.Arrow size={15} />} className="w-full justify-center">
                    Make a proposal
                  </Button>
                  <p className="text-center text-[12px] text-ink-3">Free to send: a signature, not a transaction. Nothing is paid unless you are chosen and hired.</p>
                </div>
              ) : isPoster && ended ? (
                <div className="flex flex-col gap-2">
                  <LinkButton href={`/workspace/requests/new?from=${request.id}`} trailing={<Icon.Arrow size={15} />} className="w-full justify-center">
                    Post it again
                  </LinkButton>
                  <p className="text-center text-[12px] text-ink-3">Opens this request filled in, to check and sign as a new one.</p>
                </div>
              ) : isPoster ? (
                <p className="text-[12.5px] text-ink-3">This is your request. Proposals appear on the page as builders send them.</p>
              ) : !taking ? (
                <p className="text-[12.5px] text-ink-3">This request is not taking proposals.</p>
              ) : null}
            </>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col gap-10 lg:col-start-1 lg:row-start-2">{children}</div>
    </div>
  );
}
