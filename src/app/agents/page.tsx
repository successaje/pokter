import Link from 'next/link';
import { StatusState } from '@/components/ui/States';
import { Suspense } from 'react';

import { CATEGORIES, CATEGORY_BY_ID } from '@/lib/agents/categories';
import { listSearchable,
  listingsPerOwner,
  preferDistinctOwners,
} from '@/lib/marketplace';
import { parseQuery, stringifyQuery } from '@/lib/search/query';
import { matchesQuery, offersDirectHire, verdictFor } from '@/lib/search/match';
import { AgentCard } from '@/components/AgentCard';
import { CatalogueViews } from '@/components/shell/CatalogueViews';
import { TierNote } from '@/components/proof/TierNote';
import { AgentSearch } from '@/components/search/AgentSearch';
import { FilterSidebar } from '@/components/search/FilterSidebar';
import { FILTER_GROUPS } from '@/lib/search/filters';
import { rankForBrief } from '@/lib/brief/rank';
import { BriefMatches } from '@/components/search/BriefMatches';
import { MarketplaceControls } from '@/components/search/MarketplaceControls';
import { orderMarketplace, parseMarketplaceOrder } from '@/lib/search/order';

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
 * Six, because the grid now runs at one, two and three columns and six
 * divides all three. It was eight when the widest breakpoint was four
 * columns; four turned out to be too narrow for the larger type and was
 * snapping names mid-word, so both numbers moved together.
 */
const PREVIEW_PER_CATEGORY = 6;

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = typeof params.q === 'string' ? params.q : '';
  const query = parseQuery(raw);
  /* Set when someone arrived from the hero having described the job. */
  const brief = typeof params.brief === 'string' ? params.brief.trim().slice(0, 400) : '';
  const order = parseMarketplaceOrder(params.sort);

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
  const filtered = query.qualifiers.length
    ? all.filter((agent) => matchesQuery(agent, query))
    : all;
  const matched = orderMarketplace(filtered, order);

  const byCategory = CATEGORIES.map(({ id }) => ({
    category: id,
    entries: matched.filter((entry) => entry.listing.category === id),
  }));

  const filtering = query.qualifiers.length > 0;

  /*
   * The answer to the brief, above the catalogue rather than instead of it.
   *
   * Someone who typed what they wanted should see agents, not a filtered view
   * they now have to interpret — but they should also still be able to browse,
   * because a three-item shortlist drawn from a keyword read is a suggestion
   * and the page should not pretend otherwise.
   */
  const briefMatch = brief ? rankForBrief(brief, all, 3) : null;

  /*
   * Counted over everything indexed rather than the current result, for the
   * same reason the filter counts are: this describes the marketplace, and
   * stays true whatever the reader has narrowed to.
   */
  const verdicts = all.map((entry) => verdictFor(entry));
  // Counted over everything indexed, so a card says how much of the whole
  // catalogue its publisher is rather than how much of the current filter.
  const fleets = listingsPerOwner(all);
  const provenCount = verdicts.filter((v) => v === 'proven').length;
  const emergingCount = verdicts.filter((v) => v === 'emerging').length;
  const observedCount = verdicts.filter((v) => v === 'observed').length;
  const askedForProven = query.qualifiers.some(
    (q) => stringifyQuery([q]) === 'is:proven',
  );

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
      <CatalogueViews active={'/agents'} />

      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Marketplace</h1>
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

      {briefMatch && (
        <BriefMatches
          brief={brief}
          categoryLabel={
            briefMatch.reading.category
              ? (CATEGORY_BY_ID.get(briefMatch.reading.category)?.label ?? null)
              : null
          }
          entries={briefMatch.results}
        />
      )}

      {/*
        Suppressed when the empty state below is already saying it. Filtering
        to Proven and finding nothing produced the note at the top of the page
        and the same sentence again in the middle of it, which is the sort of
        repetition that reads as a template rather than as an answer.
      */}
      {!(askedForProven && matched.length === 0) && (
        <TierNote
          proven={provenCount}
          emerging={emergingCount}
          observed={observedCount}
          className="max-w-2xl"
        />
      )}

      <Suspense fallback={<div className="h-28" />}>
        <AgentSearch resultCount={matched.length} />
      </Suspense>

      <Suspense fallback={<div className="h-16" />}>
        <MarketplaceControls order={order} />
      </Suspense>

      <details className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-4 py-3 text-[10px] leading-5 text-[color:var(--text-muted)]">
        <summary className="cursor-pointer font-semibold text-[color:var(--text-secondary)]">Why this order?</summary>
        <p className="mt-2 max-w-3xl">Recommended results prioritize agents Pokter can currently offer for hire, recent observed responses, completed paid work, a current wallet-signed price, and then evidence depth. Jobs <em>taken</em> never improve rank — only jobs finished, because an agent that accepts escrow and does not deliver is the case this ordering exists to avoid rewarding. Registration alone does not improve rank. Pokter-operated agents receive no first-party boost.</p>
      </details>

      {/*
        Two columns from 1024px up: a standing filter shelf beside the
        results. Below that the shelf would cost more room than the results
        it filters, so phones keep the chip row and its sheet, which was built
        for exactly that width.
      */}
      <div className="grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <Suspense fallback={null}>
          <FilterSidebar
            groups={FILTER_GROUPS}
            counts={filterCounts}
            /*
              Pinned. The shelf is how you navigate 81 agents, and scrolling
              past the fold used to take it with you — so narrowing the set
              meant scrolling back up to the controls that do it. It sits
              below the site header and scrolls internally when the groups
              outgrow the viewport.
            */
            className="hidden lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
          />
        </Suspense>

        <div className="flex min-w-0 flex-col gap-8">

      {matched.length === 0 ? (
        /* §60. An honest empty state, naming the filter that produced it. */
        /*
          When the proven filter is what emptied the page, the generic line
          invites the reader to conclude the filter is broken. The specific
          reason is more useful and is the marketplace's actual state.
        */
        <StatusState
          title={
            askedForProven && provenCount === 0
              ? 'No agent is Proven yet.'
              : 'No agent matches these filters.'
          }
          body={
            askedForProven && provenCount === 0
              ? `That tier needs two independent measurers agreeing, and Pokter does not count its own probing as one of them. ${emergingCount} agents are Emerging — measured, but corroborated by fewer measurers than that.`
              : `${all.length} agents are indexed. Loosening the evidence requirement widens the set — it does not create evidence that is missing.`
          }
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
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {/*
                    The preview shows distinct publishers first.
                    
                    Two operators hold eighteen of the eighty listings, so a
                    preview taken straight off the ranking could be nine
                    near-identical cards from one of them — a category page
                    that looks like a catalogue of one agent. The full count
                    above is untouched and the rest are all still behind "View
                    all", because the duplication is a fact about this
                    marketplace rather than something to quietly drop.
                  */}
                  {preferDistinctOwners(entries, PREVIEW_PER_CATEGORY).map(
                    (entry) => (
                      <AgentCard
                        key={entry.listing.agent.token_id}
                        listing={entry.listing}
                        verdict={verdictFor(entry)}
                        record={entry.record}
                        history={entry.history}
                        hirable={offersDirectHire(entry)}
                        fleetSize={fleets.get(
                          entry.listing.agent.owner_address?.toLowerCase() ?? '',
                        )}
                      />
                    ),
                  )}
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
