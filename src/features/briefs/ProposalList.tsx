import Link from 'next/link';

import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { VERDICT_LABEL } from '@/lib/proof/engine';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { AgentAvatar, ProbeStrip } from '@/ui/Agent';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { AwardBid } from './BriefActions';
import type { ProposalCard } from './proposal-cards';
import { ago } from './RequestRow';

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);

/**
 * The proposals on a request, laid out to be compared.
 *
 * Every card answers the same questions in the same places — who, how
 * much, how soon, how, and what the agent has done before — so a buyer
 * can read across them rather than into each. The record is the agent's
 * catalogue row: whether it answers Pokter's checks, what paid work it
 * has completed, the last price it signed. Where Pokter has no record,
 * the card says that instead of leaving a gap that reads as "fine".
 */
export function ProposalList({
  cards,
  request,
  now,
}: {
  cards: ProposalCard[];
  request: { id: string; poster: string; chainId: number; deliverDays: number; budgetU: number; state: 'open' | 'awarded' | 'cancelled'; awardedBidId: string | null };
  now: number;
}) {
  const unit = request.chainId === 97 ? 'test $U' : '$U';
  return (
    <ul className="flex flex-col gap-3">
      {cards.map(({ bid, name, imageUrl, row, bidder }) => {
        const chosen = request.awardedBidId === bid.id;
        const later = bid.deliverDays > request.deliverDays;
        const saving = request.budgetU - bid.priceU;
        return (
          <li key={bid.id} className={cn('flex flex-col gap-4 rounded-[16px] border p-5', chosen ? 'border-ok/40 bg-ok-wash' : 'border-rule bg-raised')}>
            {/* Who first, then the offer. The name never gives way to the price. */}
            <div className="flex items-start gap-3">
              <Link href={`/agents/${bid.agentChainId}/${bid.agentTokenId}`} className="shrink-0">
                <AgentAvatar name={name} imageUrl={imageUrl} seed={`${bid.agentChainId}:${bid.agentTokenId}`} size={44} />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link href={`/agents/${bid.agentChainId}/${bid.agentTokenId}`} className="break-words text-[15.5px] font-semibold hover:underline">
                  {name}
                </Link>
                <span className="text-[12.5px] text-ink-3">
                  {row && row.category !== 'unclassified' ? `${row.categoryLabel} · ` : ''}
                  {bid.agentChainId === 56 ? 'BNB Chain' : 'Testnet'} #{bid.agentTokenId} · by {bidder?.name ?? shortAddress(bid.bidder)}
                </span>
              </div>
              <Offer className="hidden sm:flex sm:flex-col sm:items-end" price={`${bid.priceU.toFixed(2)} ${unit}`} delivery={`${days(bid.deliverDays)} after hiring`} late={later ? `asked ${days(request.deliverDays)}` : null} />
            </div>
            <Offer className="flex flex-wrap items-baseline gap-x-2 sm:hidden" price={`${bid.priceU.toFixed(2)} ${unit}`} delivery={`${days(bid.deliverDays)} after hiring`} late={later ? `asked ${days(request.deliverDays)}` : null} />

            {bid.note && <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-ink-2">{bid.note}</p>}

            {/* The agent's record on Pokter, as one line of facts in the same order on every card. */}
            {row ? (
              <ul aria-label="Record on Pokter" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[10px] bg-sunken/70 px-3.5 py-2.5 text-[12.5px] text-ink-3">
                <li className="flex items-center gap-2">
                  {row.probes > 0 && row.rate !== null ? (
                    <>
                      <span>
                        <span className="font-medium text-ink">{Math.round(row.rate * 100)}%</span> of checks answered · {VERDICT_LABEL[row.verdict]}
                      </span>
                      <ProbeStrip cells={row.cells} className="hidden h-4 sm:flex" />
                    </>
                  ) : (
                    'Not checked by Pokter yet'
                  )}
                </li>
                <li>
                  {row.paid.jobs > 0 ? (
                    <>
                      <span className="font-medium text-ink">{row.paid.completed}</span> of {row.paid.jobs} paid jobs completed
                    </>
                  ) : (
                    'No paid jobs yet'
                  )}
                </li>
                <li>{row.priceState === 'signed' && row.priceU !== null ? <>Last signed price <span className="font-medium text-ink">{formatQuotedPrice(row.priceU)}</span></> : 'No signed price yet'}</li>
              </ul>
            ) : (
              <p className="rounded-[10px] bg-sunken/70 px-3.5 py-2.5 text-[12.5px] text-ink-3">Not listed on Pokter yet: no record of its checks or paid jobs here.</p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
              <span className="text-[12.5px] text-ink-3">
                Sent {ago(bid.placedAt, now)}
                {saving > 0.004 ? ` · ${saving.toFixed(2)} ${unit} under budget` : ''}
              </span>
              {chosen ? (
                <span className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ok">
                    <Icon.Check size={13} /> Chosen
                  </span>
                  {/* Choosing picked who; this is still the ordinary hire, funded by the buyer's own wallet, with this proposal's price carried in. */}
                  <LinkButton size="s" href={`/hire/${bid.agentChainId}/${bid.agentTokenId}?escrow=${request.chainId}&proposal=${bid.id}`}>
                    Hire and fund
                  </LinkButton>
                </span>
              ) : (
                request.state === 'open' && <AwardBid briefId={request.id} bid={bid} poster={request.poster} chainId={request.chainId} />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Offer({ price, delivery, late, className }: { price: string; delivery: string; late: string | null; className?: string }) {
  return (
    <span className={className}>
      <span className="t-readout text-[16.5px] text-ink">{price}</span>
      <span className={cn('text-[12.5px]', late ? 'font-medium text-watch' : 'text-ink-3')}>
        {delivery}
        {late ? ` · ${late}` : ''}
      </span>
    </span>
  );
}
