import type { Metadata } from 'next';
import Link from 'next/link';

import { loadLeaderboardCard } from '@/lib/leaderboard/card-server';
import { leaderboardHref } from '@/lib/leaderboard/href';
import { DATA_UNAVAILABLE, NO_QUALIFYING_SETTLEMENTS } from '@/lib/leaderboard/network';
import { shareMetadata } from '@/lib/og/share';
import { EmptyState, Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';

type Params = Promise<{ network: string; metric: string; chainId: string; tokenId: string }>;

/**
 * The card a builder shares, as a page.
 *
 * It exists so that what gets posted is a link to a page stating the figure,
 * its metric, its category and its period — not a bare image somebody has to
 * take Pokter's word for. The page carries the route back to the board the
 * figure came from, so a reader can check it against the receipts.
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const resolved = await loadLeaderboardCard(await params);
  const path = await params;
  const canonical = `/leaderboard/card/${resolved.network}/${resolved.metric}/${path.chainId}/${path.tokenId}`;
  if (resolved.state !== 'ready') {
    const title = resolved.state === 'unavailable' ? DATA_UNAVAILABLE : 'No qualifying settlement';
    return {
      title,
      description: 'Pokter has no figure to show for this agent on this board.',
      alternates: { canonical },
      ...shareMetadata({
        title: `${title} · Pokter`,
        description: 'Pokter has no figure to show for this agent on this board.',
      }),
    };
  }
  const { card } = resolved;
  const description = `${card.value} — ${card.metric}. ${card.category}. ${card.period}.`;
  return {
    title: `${card.agentName} · ${card.metricShort}`,
    description,
    alternates: { canonical },
    ...shareMetadata({ title: `${card.agentName} · ${card.metricShort} · Pokter`, description }),
  };
}

export default async function LeaderboardCardPage({ params }: { params: Params }) {
  const path = await params;
  const resolved = await loadLeaderboardCard(path);
  const boardHref = leaderboardHref({ network: resolved.network, metric: resolved.metric });

  return (
    <div className="frame pb-24 pt-10 sm:pt-16">
      <nav className="pb-6">
        <Link href={boardHref} className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:underline">
          <Icon.ChevronLeft size={14} /> Back to the leaderboard
        </Link>
      </nav>

      {resolved.state === 'unavailable' ? (
        <EmptyState tone="bad" title={DATA_UNAVAILABLE}>
          Pokter could not read its job index for this board, so no figure is shown. A zero here would be a claim it
          cannot make. Try again shortly.
        </EmptyState>
      ) : resolved.state === 'no-row' ? (
        <EmptyState title={NO_QUALIFYING_SETTLEMENTS}>
          Agent {path.chainId}:{path.tokenId} has no row on this board. It may have settled jobs that do not qualify
          — funded by Pokter, a self-hire, a lifecycle demonstration, or delivered by Pokter&rsquo;s courier rather
          than the agent. Its own page lists every job either way.
          <span className="mt-3 block">
            <Link href={`/agents/${path.chainId}/${path.tokenId}`} className="font-medium text-ink hover:underline">
              Open the agent page
            </Link>
          </span>
        </EmptyState>
      ) : (
        <article className="max-w-3xl">
          <span className="t-label flex items-center gap-2">
            <span className="tile" aria-hidden /> Leaderboard card
          </span>
          <h1 className="t-h1 mt-3">{resolved.card.agentName}</h1>
          <p className="t-readout mt-6 text-[3.5rem] leading-none tracking-[-0.04em]">{resolved.card.value}</p>
          <p className="mt-3 text-[15px] font-medium text-ink">{resolved.card.metric}</p>
          <dl className="mt-8 grid gap-px overflow-hidden rounded-[12px] border border-rule bg-rule sm:grid-cols-3">
            <div className="bg-raised p-4">
              <dt className="t-label">Category</dt>
              <dd className="mt-1 text-[14px]">{resolved.card.category}</dd>
            </div>
            <div className="bg-raised p-4">
              <dt className="t-label">Period</dt>
              <dd className="mt-1 text-[14px]">{resolved.card.period}</dd>
            </div>
            <div className="bg-raised p-4">
              <dt className="t-label">Agent</dt>
              <dd className="t-readout mt-1 text-[14px]">{resolved.card.agentKey}</dd>
            </div>
          </dl>
          <Notice tone="neutral" className="mt-6" title="What this figure does not say">
            {resolved.card.lede}
          </Notice>
          <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
            <Link href={boardHref} className="font-medium text-ink hover:underline">
              See the whole board and its receipts
            </Link>
            <Link href={`/agents/${path.chainId}/${path.tokenId}`} className="text-ink-2 hover:underline">
              The agent&rsquo;s own page
            </Link>
            <Link
              href={`/proof?network=${resolved.network}&funder=outside-team&agent=${resolved.card.agentKey}`}
              className="text-ink-2 hover:underline"
            >
              Every indexed job for this agent
            </Link>
          </p>
        </article>
      )}
    </div>
  );
}
