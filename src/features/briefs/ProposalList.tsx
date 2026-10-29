import Link from 'next/link';

import { requestAmountLabel, requestTokenOf } from '@/lib/briefs/model';
import { belowSignedPrice } from '@/lib/briefs/price-floor';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { formatAmount } from '@/lib/network/tokens';
import { VERDICT_LABEL } from '@/lib/proof/engine';
import { jobHref } from '@/lib/jobs/href';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { AgentAvatar, ProbeStrip } from '@/ui/Agent';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { AwardBid, ChangeChoice } from './BriefActions';
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
  hire = null,
}: {
  cards: ProposalCard[];
  request: {
    id: string;
    poster: string;
    chainId: number;
    deliverDays: number;
    budgetU: number;
    budgetRaw: string;
    /** The request's token; null on a request from before tokens, which is $U. Every proposal on it is in it. */
    paymentToken: string | null;
    state: 'open' | 'awarded' | 'cancelled';
    awardedBidId: string | null;
  };
  now: number;
  /** The job the chosen proposal became, when the poster has hired it (`hireForProposal`). */
  hire?: { jobId: string; chainId: number; returned: boolean } | null;
}) {
  const token = requestTokenOf(request);
  const testnet = request.chainId === 97;
  /* How far under budget, from the exact amounts in the request's one token. */
  const under = (priceRaw: string): string | null => {
    if (!token) return null;
    try {
      const diff = BigInt(request.budgetRaw) - BigInt(priceRaw);
      if (diff <= 0n) return null;
      const label = formatAmount(request.chainId, token.address, diff)?.label;
      return label ? `${testnet ? 'test ' : ''}${label}` : null;
    } catch {
      return null;
    }
  };
  /* Laid out by the room the list has, not the window: the proposal panel beside it may be open or closed. */
  return (
    <div className="@container">
      <ul className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
        {cards.map(({ bid, name, imageUrl, row, bidder }) => {
          const chosen = request.awardedBidId === bid.id;
          const later = bid.deliverDays > request.deliverDays;
          const saving = under(bid.priceRaw);
          const long = bid.note.length > 200;
          const underSigned = row !== null && belowSignedPrice({ priceRaw: bid.priceRaw, paymentToken: bid.paymentToken ?? token?.address ?? null }, { priceRaw: row.priceRaw, currency: row.priceCurrency });
          return (
            <li key={bid.id} className={cn('flex flex-col gap-3.5 rounded-[16px] border p-4', chosen ? 'border-ok/40 bg-ok-wash' : 'border-rule bg-raised')}>
              {/* Who, then the offer, then how: the same order on every card, so they compare across. */}
              <div className="flex items-start gap-3">
                <Link href={`/agents/${bid.agentChainId}/${bid.agentTokenId}`} className="shrink-0">
                  <AgentAvatar name={name} imageUrl={imageUrl} seed={`${bid.agentChainId}:${bid.agentTokenId}`} size={40} />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/agents/${bid.agentChainId}/${bid.agentTokenId}`} className="break-words text-[15px] font-semibold hover:underline">
                    {name}
                  </Link>
                  <span className="text-[12px] text-ink-3">
                    {row && row.category !== 'unclassified' ? `${row.categoryLabel} · ` : ''}
                    {bid.agentChainId === 56 ? 'BNB Chain' : 'Testnet'} #{bid.agentTokenId}
                  </span>
                </div>
                {chosen && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-ok">
                    <Icon.Check size={13} aria-hidden /> {hire && !hire.returned ? 'Hired' : 'Chosen'}
                  </span>
                )}
              </div>

              <div className="flex items-baseline justify-between gap-3 border-y border-rule py-2.5">
                <span className="t-readout text-[16px] text-ink">
                  {requestAmountLabel(request, bid.priceU)}
                  {testnet && <span className="text-[12px] text-ink-3"> · test</span>}
                </span>
                <span className={cn('text-right text-[12.5px]', later ? 'font-medium text-watch' : 'text-ink-3')}>
                  {days(bid.deliverDays)} after hiring{later ? ` · asked ${days(request.deliverDays)}` : ''}
                </span>
              </div>
              {/* Hired from this proposal, the agent is asked for its price and would sign its own: say so before anyone chooses it. */}
              {underSigned && (
                <p className="-mt-1.5 text-[12.5px] leading-snug text-watch">
                  Below the {row!.priceLabel} this agent last signed, so it cannot be funded at this price unless the agent lowers what it signs.
                </p>
              )}

              {bid.note &&
                (long ? (
                  <details className="group text-[13.5px] leading-relaxed text-ink-2">
                    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <span className="line-clamp-3 whitespace-pre-wrap break-words group-open:line-clamp-none">{bid.note}</span>
                      <span className="mt-1 inline-block text-[12.5px] font-medium text-ink-3 hover:text-ink group-open:hidden">Read the full approach</span>
                    </summary>
                  </details>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink-2">{bid.note}</p>
                ))}

              {/* The agent's record on Pokter, in the same three facts on every card. */}
              {row ? (
                <ul aria-label="Record on Pokter" className="flex flex-col gap-1 text-[12.5px] text-ink-3">
                  <li className="flex items-center justify-between gap-2">
                    {row.probes > 0 && row.rate !== null ? (
                      <>
                        <span>
                          <span className="font-medium text-ink">{Math.round(row.rate * 100)}%</span> of checks answered · {VERDICT_LABEL[row.verdict]}
                        </span>
                        <ProbeStrip cells={row.cells} className="h-4" />
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
                  <li>
                    {row.priceState === 'signed' && row.priceU !== null ? (
                      /* In the quote's own money, which may not be the request's; an unrecorded currency is said to be unknown. */
                      <>
                        Last signed escrow quote <span className="font-medium text-ink">{row.priceRaw ? row.priceLabel : formatQuotedPrice(row.priceU, row.priceCurrency)}</span>
                      </>
                    ) : (
                      'No signed price yet'
                    )}
                  </li>
                </ul>
              ) : (
                <p className="text-[12.5px] text-ink-3">Not listed on Pokter yet: no record of its checks or paid jobs.</p>
              )}

              <div className="mt-auto flex flex-col gap-2.5 pt-1">
                <span className="text-[12px] text-ink-3">
                  By {bidder?.name ?? shortAddress(bid.bidder)} · {ago(bid.placedAt, now)}
                  {saving ? ` · ${saving} under budget` : ''}
                </span>
                {chosen && hire && !hire.returned ? (
                  /* Hired already: the job is the next place to look, and a second "Hire and fund" would fund it twice. */
                  <LinkButton size="s" intent="secondary" href={jobHref(hire)} className="justify-center">
                    View job #{hire.jobId}
                  </LinkButton>
                ) : chosen ? (
                  /* Choosing picked who; this is still the ordinary hire, funded by the buyer's own wallet, with this proposal's price carried in. */
                  <>
                    {hire?.returned && <span className="text-[12px] text-ink-3">Job #{hire.jobId} was refunded, so nobody was paid for it.</span>}
                    <LinkButton size="s" href={`/hire/${bid.agentChainId}/${bid.agentTokenId}?escrow=${request.chainId}&proposal=${bid.id}`} className="justify-center">
                      {hire?.returned ? 'Hire again' : 'Hire and fund'}
                    </LinkButton>
                    {/* Nothing is funded for it, so the poster can still choose another. */}
                    <ChangeChoice briefId={request.id} bidId={bid.id} poster={request.poster} />
                  </>
                ) : (
                  request.state === 'open' && <AwardBid briefId={request.id} bid={bid} poster={request.poster} chainId={request.chainId} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
