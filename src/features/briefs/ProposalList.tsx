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
      {cards.map(({ bid, name, imageUrl, row }) => {
        const chosen = request.awardedBidId === bid.id;
        const later = bid.deliverDays > request.deliverDays;
        const saving = request.budgetU - bid.priceU;
        return (
          <li key={bid.id} className={cn('flex flex-col gap-4 rounded-[16px] border p-5', chosen ? 'border-ok/40 bg-ok-wash' : 'border-rule bg-raised')}>
            <div className="flex items-start justify-between gap-4">
              <Link href={`/agents/${bid.agentChainId}/${bid.agentTokenId}`} className="group flex min-w-0 items-center gap-3">
                <AgentAvatar name={name} imageUrl={imageUrl} seed={`${bid.agentChainId}:${bid.agentTokenId}`} size={44} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15.5px] font-semibold group-hover:underline">{name}</span>
                  <span className="truncate text-[12.5px] text-ink-3">
                    {row && row.category !== 'unclassified' ? `${row.categoryLabel} · ` : ''}
                    {bid.agentChainId === 56 ? 'BNB Chain' : 'Testnet'} #{bid.agentTokenId} · by {shortAddress(bid.bidder)}
                  </span>
                </span>
              </Link>
              <span className="flex shrink-0 flex-col items-end">
                <span className="t-readout text-[19px] text-ink">
                  {bid.priceU.toFixed(2)} {unit}
                </span>
                <span className={cn('text-[12.5px]', later ? 'font-medium text-watch' : 'text-ink-3')}>
                  {days(bid.deliverDays)} after hiring{later ? ` · asked ${days(request.deliverDays)}` : ''}
                </span>
              </span>
            </div>

            {bid.note && <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-ink-2">{bid.note}</p>}

            {/* The record, in the same three slots on every card. */}
            {row ? (
              <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-[12px] border border-rule bg-rule sm:grid-cols-3">
                <Fact label="Answers Pokter’s checks">
                  {row.probes > 0 && row.rate !== null ? (
                    <span className="flex items-center justify-between gap-2">
                      <span>
                        {Math.round(row.rate * 100)}%{' '}
                        <span className="font-normal text-ink-3">· {VERDICT_LABEL[row.verdict]}</span>
                      </span>
                      <ProbeStrip cells={row.cells} className="h-5 shrink-0" />
                    </span>
                  ) : (
                    <span className="font-normal text-ink-3">Not checked yet</span>
                  )}
                </Fact>
                <Fact label="Paid jobs">
                  {row.paid.jobs > 0 ? (
                    <>
                      {row.paid.completed} completed <span className="font-normal text-ink-3">of {row.paid.jobs}</span>
                    </>
                  ) : (
                    <span className="font-normal text-ink-3">None yet</span>
                  )}
                </Fact>
                <Fact label="Last signed price">
                  {row.priceState === 'signed' && row.priceU !== null ? formatQuotedPrice(row.priceU) : <span className="font-normal text-ink-3">No signed price</span>}
                </Fact>
              </dl>
            ) : (
              <p className="rounded-[12px] border border-dashed border-rule-strong px-4 py-3 text-[13px] text-ink-3">
                Not listed on Pokter yet, so there is no record of its checks or paid jobs here.
              </p>
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

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-raised px-3.5 py-2.5">
      <dt className="text-[11.5px] text-ink-3">{label}</dt>
      <dd className="text-[13.5px] font-medium text-ink">{children}</dd>
    </div>
  );
}
