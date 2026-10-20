import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AwardBid, WithdrawRequest } from '@/features/briefs/BriefActions';
import { ProposalForm } from '@/features/briefs/ProposalForm';
import { closingDate, RequestTerms } from '@/features/briefs/RequestTerms';
import { acceptsProposals } from '@/lib/briefs/model';
import { getBriefStore } from '@/lib/briefs/store';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { Address } from '@/ui/Data';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { LinkButton } from '@/ui/Button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const brief = getBriefStore().get((await params).id);
  return { title: brief ? brief.title : 'Request' };
}

export default async function BriefPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const store = getBriefStore();
  const brief = store.get(id);
  if (!brief) notFound();
  const bids = store.bidsFor(id);
  const awarded = brief.awardedBidId ? bids.find((b) => b.id === brief.awardedBidId) ?? null : null;
  const taking = acceptsProposals(brief);
  const status =
    brief.state === 'awarded'
      ? { label: 'Agent chosen', tone: 'border-ok/30 bg-ok-wash text-ok' }
      : brief.state === 'cancelled'
        ? { label: 'Withdrawn', tone: 'border-rule-strong text-ink-3' }
        : taking
          ? { label: 'Taking proposals', tone: 'border-ok/30 bg-ok-wash text-ok' }
          : { label: 'Proposals closed', tone: 'border-rule-strong text-ink-3' };

  return (
    <div className="frame pb-24 pt-8 sm:pt-12">
      <Link href="/requests" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
        <Icon.ChevronLeft size={14} /> Requests
      </Link>

      {sp.posted === '1' && brief.state === 'open' && (
        <Notice tone="ok" title="Your request is live" className="mt-5">
          Builders can send proposals now. They appear here and under Hiring → My requests. Nothing is funded until you hire.
        </Notice>
      )}

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <div className="flex flex-col gap-3">
            <span className={`inline-flex h-6 w-fit items-center rounded-full border px-2.5 text-[12px] font-medium ${status.tone}`}>{status.label}</span>
            <RequestTerms
              content={brief}
              byline={
                <>
                  Posted {closingDate(brief.postedAt)} by <Address address={brief.poster} chainExplorer={false} /> · signed by that wallet
                </>
              }
            />
          </div>

          {brief.state === 'open' && (
            <div className="flex justify-start">
              <WithdrawRequest briefId={brief.id} poster={brief.poster} />
            </div>
          )}

          {taking && (
            <section aria-labelledby="bid-title">
              <h2 id="bid-title" className="t-label mb-3">Send a proposal</h2>
              <ProposalForm briefId={brief.id} requestDays={brief.deliverDays} requestBudgetU={brief.budgetU} />
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <h2 className="t-label">{bids.length === 1 ? '1 proposal' : `${bids.length} proposals`}</h2>
          {bids.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-rule-strong px-5 py-4 text-[13.5px] text-ink-2">
              {taking
                ? 'No proposals yet. Each one names an agent, a price and a delivery time, signed by the wallet the registry says owns that agent.'
                : 'No proposals were sent.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {bids.map((bid) => {
                const isAwarded = awarded?.id === bid.id;
                return (
                  <li
                    key={bid.id}
                    className={`flex flex-col gap-2.5 rounded-[14px] border p-4 ${isAwarded ? 'border-ok/40 bg-ok-wash' : 'border-rule bg-raised'}`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <Link href={`/agents/${bid.agentChainId}/${bid.agentTokenId}`} className="text-[14px] font-medium hover:underline">
                        Agent #{bid.agentTokenId}
                      </Link>
                      <span className="t-readout text-[15px]">{formatQuotedPrice(bid.priceU)}</span>
                    </span>
                    <span className="text-[12.5px] text-ink-3">
                      delivers within {bid.deliverDays === 1 ? '1 day' : `${bid.deliverDays} days`} of hiring · signed by{' '}
                      <Address address={bid.bidder} chainExplorer={false} />
                    </span>
                    {bid.note && <p className="text-[13px] leading-relaxed text-ink-2">{bid.note}</p>}
                    {isAwarded ? (
                      <span className="flex flex-wrap items-center justify-between gap-2 border-t border-ok/25 pt-2.5">
                        <span className="text-[12.5px] font-medium text-ok">Chosen</span>
                        {/* Choosing picked who; this is still the ordinary
                            hire, funded by the buyer's own wallet, with this
                            proposal's price carried in to compare against. */}
                        <LinkButton size="s" href={`/hire/${bid.agentChainId}/${bid.agentTokenId}?escrow=${brief.chainId}&proposal=${bid.id}`}>
                          Hire and fund
                        </LinkButton>
                      </span>
                    ) : (
                      brief.state === 'open' && (
                        <span className="flex justify-end border-t border-rule pt-2.5">
                          <AwardBid briefId={brief.id} bid={bid} poster={brief.poster} chainId={brief.chainId} />
                        </span>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
