import type { Metadata } from 'next';
import Link from 'next/link';

import { studioOwner } from '@/features/studio/data';
import { BuildingSignedOut } from '@/features/studio/SignedOut';
import { PageHeader } from '@/features/workspace/parts';
import { getBriefStore } from '@/lib/briefs/store';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { cn } from '@/lib/ui/cn';
import { LinkButton } from '@/ui/Button';
import { EmptyState } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

// Reads the builder's session cookie, so never cached.
export const dynamic = 'force-dynamic';
// Personal or step-by-step builder pages: kept out of search, as they were under Studio.
export const metadata: Metadata = { title: 'My proposals', robots: { index: false } };

/**
 * Proposals this builder's wallet signed on posted requests, and what became
 * of each: still open, chosen, or another agent chosen.
 */
export default async function MyProposalsPage() {
  const owner = await studioOwner();
  const header = (
    <PageHeader
      title="My proposals"
      description="Bids your wallet signed on posted requests. A chosen proposal becomes a job when the buyer funds the escrow."
      action={<LinkButton href="/requests" intent="secondary" size="s" trailing={<Icon.Arrow size={13} />}>Open requests</LinkButton>}
    />
  );
  if (!owner) {
    return (
      <>
        {header}
        <BuildingSignedOut what="your proposals" />
      </>
    );
  }
  const store = getBriefStore();
  const proposals = store.bidsBy(owner).map((bid) => ({ bid, request: store.get(bid.briefId) }));
  return (
    <>
      {header}
      {proposals.length === 0 ? (
        <EmptyState title="No proposals yet" action={<LinkButton href="/requests">See open requests</LinkButton>}>
          Buyers post work they want done. Bid with a price your agent&rsquo;s wallet signs, and it appears here.
        </EmptyState>
      ) : (
        <ul className="ruled border-y border-rule">
          {proposals.map(({ bid, request }) => {
            const outcome = !request
              ? { label: 'Request removed', tone: 'border-rule-strong text-ink-3' }
              : request.awardedBidId === bid.id
                ? { label: 'Chosen', tone: 'border-ok/30 bg-ok-wash text-ok' }
                : request.state === 'awarded'
                  ? { label: 'Another agent chosen', tone: 'border-rule-strong text-ink-3' }
                  : request.state === 'cancelled'
                    ? { label: 'Request cancelled', tone: 'border-rule-strong text-ink-3' }
                    : { label: 'Waiting for the buyer', tone: 'border-rule-strong text-ink-2' };
            return (
              <li key={bid.id}>
                <Link href={request ? `/requests/${request.id}` : '/requests'} className="flex flex-col gap-1.5 py-4 hover:bg-sunken/40 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium">{request?.title ?? 'A request no longer listed'}</span>
                    <span className="text-[12.5px] text-ink-3">
                      Your price {formatQuotedPrice(bid.priceU)} · deliver in {bid.deliverDays} days · agent <span className="t-readout">{bid.agentChainId}:{bid.agentTokenId}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className={cn('rounded-full border px-2 py-0.5 text-[11.5px] font-medium', outcome.tone)}>{outcome.label}</span>
                    <Icon.ChevronRight size={14} className="text-ink-3" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
