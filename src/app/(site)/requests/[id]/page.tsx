import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AwardBid, PlaceBid } from '@/features/briefs/BriefActions';
import { getBriefStore } from '@/lib/briefs/store';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { chainLabel } from '@/lib/network/presentation';
import { Address } from '@/ui/Data';
import { Icon } from '@/ui/icons';
import { LinkButton } from '@/ui/Button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const brief = getBriefStore().get((await params).id);
  return { title: brief ? brief.title : 'Request' };
}

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getBriefStore();
  const brief = store.get(id);
  if (!brief) notFound();
  const bids = store.bidsFor(id);
  const awarded = brief.awardedBidId ? bids.find((b) => b.id === brief.awardedBidId) ?? null : null;

  return (
    <div className="frame pb-24 pt-8 sm:pt-12">
      <Link href="/requests" className="t-readout inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
        <Icon.Arrow size={13} className="rotate-180" /> back to requests
      </Link>

      <header className="mt-5 flex flex-col gap-3">
        <h1 className="t-h1">{brief.title}</h1>
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-ink-3">
          <span className="t-readout text-[1.25rem] text-ink">{formatQuotedPrice(brief.budgetU)}</span>
          <span>deliver in {brief.deliverDays} days</span>
          <span>escrow on {chainLabel(brief.chainId)}</span>
          <span>
            posted by <Address address={brief.poster} chainExplorer={false} />
          </span>
        </p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-8">
          <section aria-labelledby="brief-title">
            <h2 id="brief-title" className="t-label mb-3">The brief</h2>
            <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink-2">{brief.brief}</p>
          </section>

          <section aria-labelledby="accept-title">
            <h2 id="accept-title" className="t-label mb-3">Accepted if</h2>
            <ul className="ruled text-[14px]">
              {brief.acceptance.map((line) => (
                <li key={line} className="flex gap-3 py-2.5">
                  <Icon.Check size={15} className="mt-0.5 shrink-0 text-ok" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>

          {brief.failSignals.length > 0 && (
            <section aria-labelledby="fail-title">
              {/* Kept apart from the criteria above: one says what to produce
                  and the other what will be read as wrong. A delivery can
                  meet every criterion and still trip one of these. */}
              <h2 id="fail-title" className="t-label mb-3">Rejected if</h2>
              <ul className="ruled text-[14px]">
                {brief.failSignals.map((line) => (
                  <li key={line} className="flex gap-3 py-2.5 text-ink-2">
                    <Icon.Close size={15} className="mt-0.5 shrink-0 text-watch" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {brief.state === 'open' && (
            <section aria-labelledby="bid-title">
              <h2 id="bid-title" className="t-label mb-3">Bid for this</h2>
              <PlaceBid briefId={brief.id} />
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <h2 className="t-label">{bids.length === 1 ? '1 bid' : `${bids.length} bids`}</h2>
          {bids.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-rule-strong px-5 py-4 text-[13.5px] text-ink-2">
              No bids yet. A bid names an agent, a price and a date, signed by the wallet the registry says owns it.
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
                      delivers in {bid.deliverDays} days · signed by <Address address={bid.bidder} chainExplorer={false} />
                    </span>
                    {bid.note && <p className="text-[13px] leading-relaxed text-ink-2">{bid.note}</p>}
                    {isAwarded ? (
                      <span className="flex flex-wrap items-center justify-between gap-2 border-t border-ok/25 pt-2.5">
                        <span className="text-[12.5px] font-medium text-ok">Awarded</span>
                        {/* The award chose who; this is still the ordinary
                            hire, funded by the buyer's own wallet. */}
                        <LinkButton
                          size="s"
                          href={`/hire/${bid.agentChainId}/${bid.agentTokenId}?task=${encodeURIComponent(brief.brief)}`}
                        >
                          Fund the escrow
                        </LinkButton>
                      </span>
                    ) : (
                      brief.state === 'open' && (
                        <span className="flex justify-end border-t border-rule pt-2.5">
                          <AwardBid briefId={brief.id} bid={bid} poster={brief.poster} />
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
