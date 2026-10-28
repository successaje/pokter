import type { Metadata } from 'next';
import Link from 'next/link';

import { AgentCard, MiniAgentCard } from '@/features/agents/AgentCard';
import { CompareToggle, CompareTray } from '@/features/compare/CompareControls';
import { DiscoverSearch } from '@/features/discover/DiscoverControls';
import { FilterBar } from '@/features/discover/FilterBar';
import { parseDiscoverParams } from '@/features/discover/params';
import { discover } from '@/features/discover/search';
import { CatalogueTools } from '@/features/discover/CatalogueTools';
import { deliveryTimes, DELIVERY_LOOKUP_CONCURRENCY } from '@/lib/agent/delivery-times';
import { mapWithConcurrency } from '@/lib/concurrency';
import { shareMetadata } from '@/lib/og/share';
import { EmptyState } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

export const metadata: Metadata = {
  title: 'All agents',
  description: 'Every agent Pokter lists on BNB Chain, with what each one answers, what it has delivered and what it costs.',
  ...shareMetadata({
    title: 'Every AI agent Pokter lists on BNB Chain',
    description: 'The whole catalogue on one page, with what each agent answers, has delivered and costs.',
  }),
};

/**
 * The whole catalogue on one page.
 *
 * Discover is the place to describe a job and be read for intent; it leads
 * with what is live, explains how it read the query, and closes with the
 * newest listings. None of that helps somebody who wants to see everything
 * and scroll, which is what this is: the same search, the same filters and
 * the same cards, with no reading of intent and no paging.
 *
 * It shares `discover()` rather than querying separately, so the two can
 * never disagree about what is listed or how many there are.
 */
export default async function AllAgentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = parseDiscoverParams(await searchParams);
  const result = await discover(p);
  const base = { ...p, pages: 1 };

  /* Only agents with a delivery to time; the rest cost no call. */
  /*
   * Capped, not `Promise.all`. One page load used to start a chain read
   * for every delivered agent at once, and each of those fans out again
   * inside `deliveryTimes`: the product of two unbounded lists, on one
   * shared CPU. The cap is small because this is decoration on a catalogue
   * — an agent whose median does not arrive in time shows a dash.
   */
  const timed = await mapWithConcurrency(
    result.rows.filter((row) => row.paid.delivered > 0),
    DELIVERY_LOOKUP_CONCURRENCY,
    async (row) => [row.key, (await deliveryTimes(row.chainId, row.tokenId).catch(() => null))?.medianMs ?? null] as const,
  );
  const deliveryByKey = new Map(timed);

  return (
    <div className="frame pb-24 pt-8 sm:pt-12">
      <header className="flex flex-col gap-5">
        <Link href="/discover" className="t-readout inline-flex w-fit items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
          <Icon.Arrow size={13} className="rotate-180" /> back to Discover
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="t-h1">All agents</h1>
          <p className="text-sm text-ink-2" aria-live="polite">
            <span className="t-readout text-ink">{result.total}</span> {result.total === 1 ? 'agent' : 'agents'}
          </p>
        </div>
        <DiscoverSearch params={base} />
      </header>

      <div className="mt-8 flex flex-col gap-6">
        <FilterBar p={base} counts={result.categoryCounts} allTasks={result.allTasksCount} filterCounts={result.filterCounts} />

        <section aria-label="Results" className="min-w-0">

          {result.total === 0 ? (
            <EmptyState title="Nothing matches these filters">
              Clear a filter, or describe the job on Discover and let Pokter read it for intent.
            </EmptyState>
          ) : (
            /* Every row, no "show more". Somebody who asked for all of them
               has said what they want to do with the page. */
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {result.rows.map((row) => (
                <li key={row.key} className="flex min-w-0 flex-col">
                  <AgentCard row={row} deliveryMs={deliveryByKey.get(row.key) ?? null} compare={<CompareToggle agentKey={row.key} variant="checkbox" compact />} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {result.recent.length > 0 && (
          <section aria-labelledby="recent-title" className="mt-6 border-t border-rule pt-8">
            <h2 id="recent-title" className="t-label mb-4">Recently listed</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {result.recent.map((row) => (
                <li key={row.key} className="flex min-w-0">
                  <MiniAgentCard row={row} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <CatalogueTools />
      </div>
      <CompareTray />
    </div>
  );
}
