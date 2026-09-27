import Link from 'next/link';
import { StatusState } from '@/components/ui/States';
import { Suspense } from 'react';

import { CATEGORIES, CATEGORY_BY_ID } from '@/lib/agents/categories';
import { listSearchable } from '@/lib/marketplace';
import { parseQuery } from '@/lib/search/query';
import { matchesQuery, offersDirectHire, verdictFor } from '@/lib/search/match';
import { AgentCard } from '@/components/AgentCard';
import { AgentSearch } from '@/components/search/AgentSearch';
import { FilterSidebar } from '@/components/search/FilterSidebar';
import { FILTER_GROUPS } from '@/lib/search/filters';

/**
 * Rendered per request rather than pre-built.
 *
 * Static generation ran each page in its own worker with no shared fetch cache,
 * so every page independently re-queried a rate-limited registry and the build
 * repeatedly blew past its 60s budget. Pre-rendering bought little anyway: this
 * data is live and revalidates every two minutes regardless.
 *
 * Responses are still cached at the fetch layer, so only the first request
 * after a revalidation window pays for the lookup. Setting SCAN_API_KEY lifts
 * the rate limit from 30 to 3,000 requests a minute and makes this moot.
 */
export const dynamic = 'force-dynamic';

/**
 * How many agents each category shows before "View all" takes over.
 *
 * Eight rather than six because the grid runs at one, two and four columns
 * and eight divides all three — six left a row of four above a row of two,
 * with two empty cells reading as a rendering fault rather than a preview.
 */
const PREVIEW_PER_CATEGORY = 8;

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = typeof params.q === 'string' ? params.q : '';
  const query = parseQuery(raw);

  /*
   * Fetched deep, shown shallow.
   *
   * The limit never governed the fetching — the discovery queries pull their
   * candidates regardless and this only slices the ranked result — so asking
   * for 30 costs no registry calls and lets the section headers state a true
   * total rather than the size of their own preview.
   *
   * What the page renders is PREVIEW_PER_CATEGORY of them. Showing all 63 put
   * the phone list at 15.7 screens, and a marketplace overview that takes
   * sixteen swipes to leave is not an overview. The rest are one tap away on
   * the category page, which is also where they belong: all four categories
   * stay first-class here, and depth lives behind each one.
   */
  const all = await listSearchable({ limit: 30 });
  const matched = query.qualifiers.length
    ? all.filter((agent) => matchesQuery(agent, query))
    : all;

  const byCategory = CATEGORIES.map(({ id }) => ({
    category: id,
    entries: matched.filter((entry) => entry.listing.category === id),
  }));

  const filtering = query.qualifiers.length > 0;

  /*
   * How many agents each filter would match, counted over everything indexed
   * rather than over the current result. Counting the current result would
   * make every unselected option read zero as soon as one filter was on,
   * which is the opposite of useful — the number is there to answer "what
   * happens if I click this", and that question is about the whole set.
   *
   * 81 agents against about twenty options is a few thousand comparisons on
   * data already in memory, so there is no reason to do it any other way.
   */
  const filterCounts: Record<string, number> = {};
  for (const group of FILTER_GROUPS) {
    for (const option of group.options) {
      const parsedOption = parseQuery(option.query);
      filterCounts[option.query] = all.filter((entry) =>
        matchesQuery(entry, parsedOption),
      ).length;
    }
  }

  return (
    <div className="flex flex-col gap-8 pt-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Agents</h1>
        {/*
          Desktop only. This paragraph documents the query syntax, which is
          reference material for someone already filtering — on a phone it was
          four lines of prose between the title and the first agent, and the
          search control below states the count anyway.
        */}
        <p className="hidden text-sm leading-relaxed text-[color:var(--text-secondary)] md:block">
          {all.length} agents indexed across {CATEGORIES.length} categories.
          Filter on what has been observed — <span className="mono">is:proven</span>,{' '}
          <span className="mono">has:probes&gt;10</span> — not just on what
          publishers claim.
        </p>
      </header>

      <Suspense fallback={<div className="h-28" />}>
        <AgentSearch resultCount={matched.length} />
      </Suspense>

      {/*
        Two columns from 1024px up: a standing filter shelf beside the
        results. Below that the shelf would cost more room than the results
        it filters, so phones keep the chip row and its sheet, which was built
        for exactly that width.
      */}
      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <Suspense fallback={null}>
          <FilterSidebar
            groups={FILTER_GROUPS}
            counts={filterCounts}
            className="hidden lg:flex"
          />
        </Suspense>

        <div className="flex min-w-0 flex-col gap-8">

      {matched.length === 0 ? (
        /* §60. An honest empty state, naming the filter that produced it. */
        <StatusState
          title="No agent matches these filters."
          body={`${all.length} agents are indexed. Loosening the evidence requirement widens the set — it does not create evidence that is missing.`}
        />
      ) : (
        byCategory.map(({ category, entries }) => {
          const meta = CATEGORY_BY_ID.get(category);
          if (!meta) return null;
          // When filtering, an empty category is a result, not a gap to fill.
          if (filtering && entries.length === 0) return null;

          return (
            <section key={category} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[color:var(--border)] pb-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-medium tracking-tight">{meta.label}</h2>
                  {/* The blurb explains the category; the label already names it. */}
                  <p className="hidden text-xs text-[color:var(--text-muted)] md:block">
                    {meta.blurb}
                  </p>
                </div>
                <div className="flex shrink-0 items-baseline gap-3">
                  <p className="tabular text-[11px] text-[color:var(--text-faint)]">
                    {entries.length} {filtering ? 'matching' : 'indexed'}
                  </p>
                  {entries.length > PREVIEW_PER_CATEGORY && (
                    <Link
                      href={`/categories/${category}`}
                      className="tap text-[11px] font-medium text-[color:var(--info)]"
                    >
                      View all {entries.length}
                    </Link>
                  )}
                </div>
              </div>

              {entries.length === 0 ? (
                <StatusState body="No agent in the registry currently matches this category with enough confidence to list." />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {entries.slice(0, PREVIEW_PER_CATEGORY).map((entry) => (
                    <AgentCard
                      key={entry.listing.agent.token_id}
                      listing={entry.listing}
                      verdict={verdictFor(entry)}
                      record={entry.record}
                      hirable={offersDirectHire(entry)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
          })
        )}
        </div>
      </div>
    </div>
  );
}
