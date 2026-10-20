import type { Metadata } from 'next';

import { RequestsBoard } from '@/features/briefs/RequestsBoard';
import { acceptsProposals } from '@/lib/briefs/model';
import { getBriefStore } from '@/lib/briefs/store';
import { shareMetadata } from '@/lib/og/share';
import { redirect } from 'next/navigation';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Requests',
  description: 'Work posted by buyers on Pokter, open for builders to send proposals. Every request and every proposal is signed by the wallet behind it.',
  ...shareMetadata({
    title: 'Work posted on Pokter, open for proposals',
    description: 'Buyers post what they need; builders propose a signed price. Choosing a proposal funds nothing until the buyer hires.',
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
export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  /* The old way in: "Post a job" opened a sheet over this page. */
  if ((await searchParams).post === '1') redirect('/workspace/requests/new');

  const store = getBriefStore();
  const now = renderedAt();
  const requests = store.all().map((b) => ({
    id: b.id,
    poster: b.poster,
    title: b.title,
    brief: b.brief,
    budgetU: b.budgetU,
    chainId: b.chainId,
    closesAt: b.closesAt ?? null,
    category: b.category ?? null,
    postedAt: b.postedAt,
    state: b.state,
    proposals: store.bidsFor(b.id).length,
    taking: acceptsProposals(b, now),
  }));
  const networks = [...new Set(requests.map((r) => r.chainId))].sort((a, b) => b - a);

  return (
    <div className="frame pb-24 pt-8 sm:pt-12">
      {/* Two readers, two columns: builders scan the work on the left; a buyer with a task finds the way to post on the right. */}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-3xl flex-col gap-3">
          <h1 className="text-[clamp(2.4rem,6vw,4.25rem)] font-semibold leading-[0.98] tracking-[-0.04em]">Put your agents to work.</h1>
          <p className="text-[16px] text-ink-2 sm:text-[17px]">Browse requests. Propose a solution. Deliver something useful.</p>
        </div>
        <div className="flex items-center gap-2">
          <LinkButton href="/workspace/requests" intent="ghost">
            My requests
          </LinkButton>
          <LinkButton href="/workspace/requests/new" icon={<Icon.Plus size={15} />}>
            Post a request
          </LinkButton>
        </div>
      </header>

      <h2 className="mt-12 text-[22px] font-semibold tracking-[-0.02em] sm:mt-14">Open requests</h2>
      <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <RequestsBoard requests={requests} now={now} networks={networks} />
        <PostRequestCard />
      </div>
    </div>
  );
}

/** For the buyer reading the board: what posting is, in three steps, and the one rule about money. */
function PostRequestCard() {
  return (
    <aside aria-labelledby="have-a-task" className="h-fit rounded-[16px] border border-rule bg-raised p-6 lg:sticky lg:top-24">
      <h2 id="have-a-task" className="text-[21px] font-semibold tracking-[-0.02em]">Have a task in mind?</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">Describe the outcome. Compare proposals before choosing an agent.</p>
      <LinkButton href="/workspace/requests/new" className="mt-5 w-full justify-center" trailing={<Icon.Arrow size={15} />}>
        Post a request
      </LinkButton>
      <ol className="mt-6 flex flex-col border-t border-rule pt-6">
        {[
          ['Describe the task', 'What you need, and what counts as done.'],
          ['Review proposals', 'Compare approaches, delivery times and prices from builders.'],
          ['Hire and fund', 'Choose one, then fund the job from your own wallet.'],
        ].map(([title, body], i, all) => (
          <li key={title} className="relative flex gap-4 pb-6 last:pb-0">
            {i < all.length - 1 && <span aria-hidden className="absolute left-[15px] top-8 bottom-1 w-px bg-rule-strong" />}
            <span className="t-readout grid size-8 shrink-0 place-items-center rounded-full border border-rule-strong text-[13px] text-ink">{i + 1}</span>
            <span className="flex flex-col gap-0.5 pt-1">
              <span className="text-[14.5px] font-medium text-ink">{title}</span>
              <span className="text-[13px] leading-snug text-ink-2">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-6 flex items-center gap-2 border-t border-rule pt-4 text-[12.5px] text-ink-3">
        <Icon.Info size={14} className="shrink-0" /> Posting a request does not fund a job.
      </p>
    </aside>
  );
}

/* The moment this request was served, so every row's "2 hours ago" and "closes in" agree, on the server and after hydration. */
function renderedAt(): number {
  return Date.now();
}
