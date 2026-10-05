import { StatusState } from '@/components/ui/States';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { listCategorySearchable } from '@/lib/marketplace';
import { matchesQuery, offersDirectHire, verdictFor } from '@/lib/search/match';
import { parseQuery } from '@/lib/search/query';
import { FILTER_GROUPS } from '@/lib/search/filters';
import { FilterSidebar } from '@/components/search/FilterSidebar';
import { AgentCard } from '@/components/AgentCard';

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
 * §18. Category-specific metrics.
 *
 * Each category is judged on what matters for that job — a health-factor
 * monitor lives or dies on response time, a grid bot on execution. These are
 * the questions the page commits to answering, and where the data does not yet
 * exist the page says so rather than substituting a generic metric.
 */
const FOCUS: Record<Category, string[]> = {
  'token-safety': [
    'Sellability',
    'Buy and sell tax',
    'Ownership and mint authority',
    'Liquidity lock',
  ],
  rebalancing: [
    'LP range management',
    'Position maintenance',
    'Rebalance frequency',
    'Gas efficiency',
  ],
  'grid-trading': [
    'Execution success',
    'Trading frequency',
    'Strategy period',
    'Range discipline',
  ],
  yield: [
    'Risk-adjusted yield',
    'Protocol exposure',
    'Capital efficiency',
    'Withdrawal constraints',
  ],
  'health-factor': [
    'Response time',
    'Alert accuracy',
    'Monitored positions',
    'Intervention history',
  ],
};

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { category: raw } = await params;
  const { q = '' } = await searchParams;
  const meta = CATEGORY_BY_ID.get(raw as Category);
  if (!meta) notFound();

  /*
   * The marketplace now sends people here with "View all 26", so this has to
   * actually hold 26. The classifier yields 15-26 per category today; 30
   * covers that with room, and costs no extra registry calls because the
   * limit only slices an already-fetched candidate set.
   */
  const entries = await listCategorySearchable(meta.id, { limit: 30 });
  const listings = entries.map(({ listing }) => listing);
  const withEvidence = listings.filter((l) => l.attestationCount > 0);

  /*
   * Counted across the whole category, not across the current result, for the
   * same reason /agents counts across everything indexed: the number answers
   * "what happens if I click this", and that question is about the set you
   * are narrowing, not the one you have already narrowed to.
   */
  /*
   * Everything except the category group. On a page that is already one
   * category, the other three count zero by construction and selecting one
   * empties the page — a shelf of dead ends dressed as choices.
   */
  const groups = FILTER_GROUPS.filter((g) => g.label !== 'Category');

  const query = parseQuery(q);
  const matched = entries.filter((entry) => matchesQuery(entry, query));
  const filterCounts: Record<string, number> = {};
  for (const group of groups) {
    for (const option of group.options) {
      const parsedOption = parseQuery(option.query);
      filterCounts[option.query] = entries.filter((entry) =>
        matchesQuery(entry, parsedOption),
      ).length;
    }
  }

  return (
    <div className="flex flex-col gap-6 pt-6 sm:gap-8">
      <Link
        href="/agents"
        className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
      >
        ← All agents
      </Link>

      <header className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {meta.label}
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          {meta.blurb}
        </p>
        <p className="text-sm italic text-[color:var(--text-muted)]">
          {meta.question}
        </p>
      </header>

      {/*
        The counts used to be three full-height cards stacked down a phone,
        so you scrolled a whole screen of chrome before meeting an agent.
        They are two numbers and a list; they now read as one line of facts
        and give the page back to the results.
      */}
      <section className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-y border-[color:var(--border)] py-3 text-[13px]">
        <span>
          <span className="tabular font-medium">{listings.length}</span>{' '}
          <span className="text-[color:var(--text-muted)]">indexed</span>
        </span>
        <span>
          <span className="tabular font-medium">{withEvidence.length}</span>{' '}
          <span className="text-[color:var(--text-muted)]">
            with on-chain evidence
          </span>
        </span>
        <span className="min-w-0 text-[color:var(--text-muted)]">
          Judged on{' '}
          <span className="text-[color:var(--text-secondary)]">
            {FOCUS[meta.id].join(' · ').toLowerCase()}
          </span>
        </span>
      </section>

      {/*
        The same shelf /agents uses, scoped to this category. Arriving here
        from "View all 26" used to mean losing every filter you had on the
        page you came from — the deeper page was the less capable one.
      */}
      <div className="grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <Suspense fallback={null}>
          <FilterSidebar
            groups={groups}
            counts={filterCounts}
            basePath={`/categories/${meta.id}`}
            className="hidden lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
          />
        </Suspense>

        <div className="flex min-w-0 flex-col gap-4">
          {matched.length === 0 ? (
            <StatusState
              title={
                listings.length === 0
                  ? undefined
                  : 'No agent here matches these filters.'
              }
              body={
                listings.length === 0
                  ? 'No agent in the registry currently matches this category with enough confidence to list.'
                  : `${listings.length} agents are indexed in ${meta.label.toLowerCase()}. Loosening the evidence requirement widens the set — it does not create evidence that is missing.`
              }
            />
          ) : (
            <>
              {query.qualifiers.length > 0 && (
                <p className="text-[12px] text-[color:var(--text-muted)]">
                  <span className="tabular">{matched.length}</span> of{' '}
                  <span className="tabular">{listings.length}</span> match
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {matched.map((entry) => (
                  <AgentCard
                    key={entry.listing.agent.token_id}
                    listing={entry.listing}
                    verdict={verdictFor(entry)}
                    record={entry.record}
                    history={entry.history}
                    hirable={offersDirectHire(entry)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
