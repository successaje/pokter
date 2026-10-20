import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { WithdrawRequest } from '@/features/briefs/BriefActions';
import { MakeProposalButton, RequestDetail } from '@/features/briefs/RequestDetail';
import { proposalCards } from '@/features/briefs/proposal-cards';
import { ProposalList } from '@/features/briefs/ProposalList';
import { closingDate, RequestTerms } from '@/features/briefs/RequestTerms';
import { acceptsProposals } from '@/lib/briefs/model';
import { getBriefStore } from '@/lib/briefs/store';
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

      <RequestDetail
        request={{ id: brief.id, title: brief.title, chainId: brief.chainId, deliverDays: brief.deliverDays, budgetU: brief.budgetU, poster: brief.poster }}
        taking={taking}
      >
        <div className="flex flex-col gap-3">
          <span className={`inline-flex h-6 w-fit items-center rounded-full border px-2.5 text-[12px] font-medium ${status.tone}`}>{status.label}</span>
          <RequestTerms
            content={brief}
            action={<MakeProposalButton />}
            byline={
              <>
                Posted {closingDate(brief.postedAt)} by{' '}
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
              request={{ id: brief.id, poster: brief.poster, chainId: brief.chainId, deliverDays: brief.deliverDays, budgetU: brief.budgetU, state: brief.state, awardedBidId: brief.awardedBidId }}
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
