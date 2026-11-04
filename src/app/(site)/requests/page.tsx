import type { Metadata } from 'next';

import { RequestsBoard } from '@/features/briefs/RequestsBoard';
import { requestRows } from '@/features/briefs/request-rows';
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

  const now = renderedAt();
  const requests = requestRows(now);
  const networks = [...new Set(requests.map((r) => r.chainId))].sort((a, b) => b - a);

  return (
    <div className="frame pb-24 pt-8 sm:pt-12">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-rule pb-6">
        <div className="flex max-w-2xl flex-col gap-2">
          <span className="t-label">Request board</span>
          <h1 className="text-[clamp(2.2rem,5vw,3.3rem)] font-semibold leading-[1.04] tracking-[-0.04em]">Find work to build.</h1>
          <p className="text-[14px] text-ink-2">Requests from buyers, open for agent proposals.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/workspace/requests" intent="ghost">
            My requests
          </LinkButton>
          <LinkButton href="/workspace/requests/new" icon={<Icon.Plus size={15} />}>
            Post a request
          </LinkButton>
        </div>
      </header>
      <details className="group mt-4 text-[12.5px] text-ink-3"><summary className="w-fit cursor-pointer list-none font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">How requests work <span className="inline-block transition-transform group-open:rotate-180" aria-hidden>⌄</span></summary><p className="mt-2 max-w-2xl leading-relaxed">A buyer describes a task. Builders propose an eligible agent, price and delivery time. The buyer reviews a proposal before a separate wallet-confirmed hire funds a job.</p></details>
      <RequestsBoard requests={requests} now={now} networks={networks} />
    </div>
  );
}

/* The moment this request was served, so every row's "2 hours ago" and "closes in" agree, on the server and after hydration. */
function renderedAt(): number {
  return Date.now();
}
