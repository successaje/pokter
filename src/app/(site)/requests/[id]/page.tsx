import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { WithdrawRequest } from '@/features/briefs/BriefActions';
import { RequestDetail } from '@/features/briefs/RequestDetail';
import { ago } from '@/features/briefs/RequestRow';
import { amountText, requestCategoryLabel, requestTokenOf, type Brief } from '@/lib/briefs/model';
import { proposalCards } from '@/features/briefs/proposal-cards';
import { ProposalList } from '@/features/briefs/ProposalList';
import { closingDate, RequestTerms } from '@/features/briefs/RequestTerms';
import { escrowMoney } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { acceptsProposals, requestStatus } from '@/lib/briefs/model';
import { getBriefStore } from '@/lib/briefs/store';
import { hireForChosenProposal } from '@/lib/briefs/hired';
import { displaySymbol, tokenIdentity } from '@/lib/network/tokens';
import { getJobStore } from '@/lib/erc8183/store';
import { Address } from '@/ui/Data';
import { AvatarImage } from '@/ui/AvatarImage';
import { avatarUrl } from '@/lib/ui/avatar-art';
import { publicIdentity } from '@/lib/profiles/identity';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

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
  const taking = acceptsProposals(brief);
  const poster = publicIdentity(brief.poster);
  const chosenBid = brief.awardedBidId ? bids.find((bid) => bid.id === brief.awardedBidId) : undefined;
  const hire = chosenBid
    ? hireForChosenProposal(getJobStore().byClient(brief.poster), brief, chosenBid)
    : null;
  const hired = hire && !hire.returned ? hire : null;
  const said = requestStatus({ ...brief, hired: Boolean(hired) });
  const status = { label: said.label, tone: said.tone === 'ended' ? 'border-rule-strong text-ink-3' : 'border-ok/30 bg-ok-wash text-ok' };

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

      <RequestDetail
        request={{ id: brief.id, title: brief.title, chainId: brief.chainId, deliverDays: brief.deliverDays, budgetU: brief.budgetU, budgetRaw: brief.budgetRaw, paymentToken: brief.paymentToken, poster: brief.poster }}
        taking={taking}
        head={
          <div className="flex flex-col gap-3">
            <span className={`inline-flex h-6 w-fit items-center rounded-full border px-2.5 text-[12px] font-medium ${status.tone}`}>{status.label}</span>
            <RequestTerms
              content={brief}
              part="head"
              facts={false}
              byline={
                <>
                  Posted by{' '}
                  {poster ? (
                    <Link href={poster.href} className="inline-flex items-center gap-1.5 align-middle font-medium text-ink-2 hover:text-ink hover:underline">
                      <AvatarImage src={poster.avatar} fallback={avatarUrl(brief.poster.toLowerCase())} name={poster.name} size={20} className="rounded-full" eager />
                      {poster.name}
                    </Link>
                  ) : (
                    <Address address={brief.poster} chainExplorer={false} />
                  )}
                  , signed with their wallet
                </>
              }
            />
          </div>
        }
        summary={<RequestSummary brief={brief} proposals={bids.length} now={renderedAt()} />}
      >
        <RequestTerms content={brief} part="body" facts={false} />

        {brief.state === 'open' && (
          <div className="flex justify-start">
            <WithdrawRequest briefId={brief.id} poster={brief.poster} />
          </div>
        )}

        {/* Under the request, so the terms and the answers to them read as one page; the form is beside them. */}
        <section aria-labelledby="proposals-title" className="flex flex-col gap-3">
          <h2 id="proposals-title" className="t-label">
            Proposals ({bids.length})
          </h2>
          {bids.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-rule-strong px-5 py-8 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-sunken text-ink-2">
                <Icon.Doc size={18} />
              </span>
              <p className="text-[14.5px] font-medium">{taking ? 'No proposals yet.' : 'No proposals were sent.'}</p>
              {taking && <p className="text-[13px] text-ink-3">Be the first to propose a solution.</p>}
            </div>
          ) : (
            <ProposalList
              cards={await proposalCards(bids)}
              now={renderedAt()}
              request={{ id: brief.id, poster: brief.poster, chainId: brief.chainId, deliverDays: brief.deliverDays, budgetU: brief.budgetU, budgetRaw: brief.budgetRaw, paymentToken: brief.paymentToken, state: brief.state, awardedBidId: brief.awardedBidId }}
              hire={hire}
            />
          )}
        </section>
      </RequestDetail>
    </div>
  );
}

/* One clock for every "sent 2 hours ago" on the page. */
function renderedAt(): number {
  return Date.now();
}

/**
 * The request's terms as a builder prices them, budget first. Times are
 * given in UTC so the page reads the same wherever it is rendered.
 */
function RequestSummary({ brief, proposals, now }: { brief: Brief; proposals: number; now: number }) {
  const money = escrowMoney(brief.chainId);
  const testnet = money.real === false;
  /* The request's own token; a request from before tokens is $U. Unknown is said, not shown as $U. */
  const token = requestTokenOf(brief);
  const symbol = token ? displaySymbol(token) : 'unknown token';
  const category = requestCategoryLabel(brief.category);
  const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);
  const rows: Array<[string, React.ReactNode]> = [
    ['Posted', ago(brief.postedAt, now)],
    ['Posted at', `${new Date(brief.postedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`],
    ['Network', <span key="n" className={cn(testnet && 'text-watch')}>{testnet ? 'BNB Testnet · test tokens' : `BNB Chain · real ${symbol}`}</span>],
    ...(token && !token.offered
      ? ([['Paid in', <span key="t" className="t-readout wrap-anywhere text-[12px]">{tokenIdentity(token)}{token.disclosure ? ` · ${token.disclosure}` : ''}</span>]] as Array<[string, React.ReactNode]>)
      : []),
    ['Delivery', `${days(brief.deliverDays)} after hiring`],
    ['Proposals close', brief.closesAt ? closingDate(brief.closesAt) : 'When one is chosen'],
    ['Proposals', String(proposals)],
    ...(category ? ([['Category', category]] as Array<[string, React.ReactNode]>) : []),
    ['Who can propose', 'Any agent’s owner'],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="t-label">Proposed budget</span>
        <span className="t-readout text-[34px] leading-none tracking-[-0.02em] text-ink">
          {amountText(brief.budgetU)} <span className="text-[18px] text-ink-2">{testnet ? `test ${symbol}` : symbol}</span>
        </span>
      </div>
      <dl className="ruled rounded-[12px] border border-rule bg-paper px-4 text-[13px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="shrink-0 text-ink-3">{label}</dt>
            <dd className="text-right font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
