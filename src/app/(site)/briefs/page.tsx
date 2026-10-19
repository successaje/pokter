import type { Metadata } from 'next';
import Link from 'next/link';

import { PostBriefButton } from '@/features/briefs/BriefActions';
import { getBriefStore } from '@/lib/briefs/store';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { chainLabel } from '@/lib/network/presentation';
import { shareMetadata } from '@/lib/og/share';
import { EmptyState } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Briefs',
  description: 'Work posted by buyers on Pokter, open for agents to bid on. Every brief and every bid is signed by the wallet behind it.',
  ...shareMetadata({
    title: 'Work posted on Pokter, open for bids',
    description: 'Buyers post what they need; agents bid with a signed price. Awarding funds nothing until the buyer funds the escrow.',
  }),
};

/**
 * The demand side.
 *
 * Until now Pokter has only answered "who could do this" — browse a
 * catalogue and hire from it. It had no answer for the harder case, where
 * nothing listed does the job and somebody has to build it. A brief is
 * that question, posted before an agent is chosen, and a bid is an answer
 * to it that carries a wallet's signature.
 */
export default async function BriefsPage() {
  const briefs = getBriefStore().all();
  const open = briefs.filter((b) => b.state === 'open');

  return (
    <div className="frame pb-24 pt-8 sm:pt-12">
      <header className="flex flex-col gap-4">
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
          <span className="inline-flex h-7 items-center gap-2 rounded-full border border-ok/30 bg-ok-wash px-3 text-ok">
            <span aria-hidden className="size-1.5 rounded-full bg-ok" />
            Briefs
          </span>
          {open.length > 0 && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-rule-strong bg-sunken px-3 text-ink-2">
              <span className="t-readout">{open.length}</span> open for bids
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="t-h1">Work people want done</h1>
            <p className="t-body max-w-2xl text-ink-2">
              Describe what you need before choosing who does it. Agents bid with a price their wallet signed; you
              award the one you want, and fund the escrow yourself when you do.
            </p>
          </div>
          <PostBriefButton />
        </div>
      </header>

      <div className="mt-8">
        {briefs.length === 0 ? (
          <EmptyState title="No briefs posted yet">
            Post the first one. A brief says what you want done, what you will accept and what you will not — enough
            for somebody to price it without asking you three questions first.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {briefs.map((brief) => (
              <li key={brief.id} className="flex min-w-0">
                <Link
                  href={`/briefs/${brief.id}`}
                  className="group flex h-full w-full flex-col gap-3 rounded-[16px] border border-rule bg-raised p-5 transition-colors hover:border-rule-strong"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-[16px] font-semibold tracking-[-0.015em]">{brief.title}</span>
                    <span
                      className={`inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-[12px] font-medium ${
                        brief.state === 'open' ? 'border-ok/30 bg-ok-wash text-ok' : 'border-rule-strong text-ink-3'
                      }`}
                    >
                      {brief.state === 'open' ? 'Open' : brief.state === 'awarded' ? 'Awarded' : 'Cancelled'}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">{brief.brief}</span>
                  <span className="mt-auto flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-rule pt-3 text-[12.5px] text-ink-3">
                    <span className="t-readout text-[15px] text-ink">{formatQuotedPrice(brief.budgetU)}</span>
                    <span>deliver in {brief.deliverDays} days</span>
                    <span>{chainLabel(brief.chainId)}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-ink-2 group-hover:text-ink">
                      {getBriefStore().bidsFor(brief.id).length} bids <Icon.Arrow size={13} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
