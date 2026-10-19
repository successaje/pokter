import type { Metadata } from 'next';
import { shareMetadata } from '@/lib/og/share';
import Link from 'next/link';
import { Suspense } from 'react';

import { RememberDiscoverResults } from '@/features/discover/ReturnToResults';

import { AgentCard, AgentRow, MiniAgentCard } from '@/features/agents/AgentCard';
import { CompareToggle, CompareTray } from '@/features/compare/CompareControls';
import { DiscoverSearch, MobileFilters, SortSelect } from '@/features/discover/DiscoverControls';
import { discoverHref, PAGE_SIZE, parseDiscoverParams } from '@/features/discover/params';
import { discover } from '@/features/discover/search';
import { CatalogueTools } from '@/features/discover/CatalogueTools';
import { FilterBar, Filters, MobileCategoryBar } from '@/features/discover/FilterBar';
import { deliveryTimes, DELIVERY_LOOKUP_CONCURRENCY } from '@/lib/agent/delivery-times';
import { mapWithConcurrency } from '@/lib/concurrency';
import { outsideActivity } from '@/lib/erc8183/outside-activity';
import { EmptyState, Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { LinkButton } from '@/ui/Button';

export const metadata: Metadata = {
  title: 'Find an agent for the job',
  description: 'Find AI agents on BNB Chain by the outcome you need, then compare verified prices, paid delivery history and correctness.',
  ...shareMetadata({
    title: 'Discover AI agents on BNB Chain',
    description: 'Search by the task you need done, with availability, signed prices and evidence on every result.',
  }),
};

export const dynamic = 'force-dynamic';


/**
 * Which network's registrations to show, where the results are read.
 *
 * It sat at the foot of the filter column, under availability and
 * evidence, and was missed: people searching for a mainnet agent saw its
 * testnet twin and concluded the mainnet one was absent. It is now beside
 * the result count and sort, on every screen size.
 */
/** The match reason, and the other network an agent shown once is also on. */
/**
 * Why this agent matched, and a second registration worth knowing about.
 *
 * "Also on testnet" has gone. A duplicate testnet listing is not a fact a
 * buyer acts on: it cannot be paid in anything real, the card already says
 * which chain this listing is registered on, and where a testnet run is
 * actually on offer the money line says "Free testnet trial" in its own
 * words. It was on 11 cards doing none of that work.
 *
 * "Also on BNB Chain" stays, and the asymmetry is the point. A testnet
 * listing that also exists on mainnet means this agent can be paid real
 * money somewhere, which is the one direction a reader needs told.
 */
function withNetworks(row: { reason: string | null; alsoOn: number[] }): string | null {
  const also = row.alsoOn.includes(56) ? 'Also on BNB Chain' : null;
  return [row.reason, also].filter(Boolean).join(' \u00b7 ') || null;
}

/*
 * The network switch was here. It is gone for now, but the `chain`
 * parameter it drove is untouched: /discover?chain=56 still filters, so
 * a saved link keeps working and putting the control back is a matter of
 * rendering it again.
 */


export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = parseDiscoverParams(await searchParams);
  const result = await discover(p);
  // Changing anything but the page count starts from the first page again.
  const base = { ...p, pages: 1 };
  const shown = result.rows.slice(0, p.pages * PAGE_SIZE);
  /*
   * How long each agent's deliveries took, for the cards on this page only.
   *
   * `deliveryTimes` reads `submittedAt` from the chain, up to eight jobs an
   * agent, so it is asked only about agents that have actually delivered
   * one. Across this catalogue that is 21 agents out of 157; for the rest
   * the store returns nothing and the function makes no call at all. Each
   * answer is cached for ten minutes, so paging does not pay twice, and a
   * read that fails leaves the card saying how many deliveries there were
   * rather than inventing a time for them.
   */
  /*
   * Capped, not `Promise.all`. One page load used to start a chain read
   * for every delivered agent at once, and each of those fans out again
   * inside `deliveryTimes`: the product of two unbounded lists, on one
   * shared CPU. The cap is small because this is decoration on a catalogue
   * — an agent whose median does not arrive in time shows a dash.
   */
  const timed = await mapWithConcurrency(
    shown.filter((row) => row.paid.delivered > 0),
    DELIVERY_LOOKUP_CONCURRENCY,
    async (row) => [row.key, (await deliveryTimes(row.chainId, row.tokenId).catch(() => null))?.medianMs ?? null] as const,
  );
  const deliveryByKey = new Map(timed);
  const activity = outsideActivity();
  const activeFilters = [p.category, p.hireable, p.answering, p.priced, p.checked, p.outsideDelivery, p.evidence !== 'any', p.chain !== 'any'].filter(Boolean).length;

  return (
    <div className="frame pb-24 pt-8 sm:pt-12">
      <Suspense>
        <RememberDiscoverResults />
      </Suspense>
      <header className="flex flex-col gap-7 sm:gap-8">
        {/*
          Three groups, not four lines. Everything here sat on one uniform
          12px gap, so the status mark, the title, the sentence under it and
          the counts all looked equally related to each other and none of
          them read as belonging together.

          The title and its sentence are one thing and close up; the mark
          above and the counts below are each their own, with room to say so.
        */}
        <div className="flex flex-col gap-5 sm:gap-4">
          {/*
            What this page is, and how much of it can be hired right now.

            The first mark used to carry `escrowAvailabilityLine()` — "On
            BNB Testnet, in test tokens". That belongs where somebody is
            about to spend, and it is still on every card that offers a
            hire and in the sheet that takes the money; at the top of a
            catalogue it was a warning attached to browsing.
          */}
          <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
            <span className="inline-flex h-7 items-center gap-2 rounded-full border border-ok/30 bg-ok-wash px-3 text-ok">
              <span aria-hidden className="size-1.5 rounded-full bg-ok" />
              Marketplace
            </span>
            {result.collections.hireable > 0 && (
              <Link
                href={discoverHref({ hireable: true }, base)}
                scroll={false}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-rule-strong bg-sunken px-3 text-ink-2 transition-colors hover:border-ink hover:text-ink"
              >
                <span className="t-readout">{result.collections.hireable}</span> hireable right now
                <Icon.Arrow size={13} />
              </Link>
            )}
          </p>
          <div className="flex flex-col gap-3 sm:gap-2">
            <h1 className="text-[2.35rem] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[3.25rem]">
              Find an agent for the job.<br />
              <span className="font-normal text-ink-3">Pay only through escrow.</span>
            </h1>
            <p className="max-w-2xl text-[17px] leading-[1.6] text-ink-2 sm:text-[18px]">
              Describe the outcome in plain English. Compare verified prices, paid delivery history and correctness before you fund the work.
            </p>
          </div>
          {/*
            What outside buyers have actually done through the escrow, above
            the box where somebody is about to ask for the same thing.

            No registry total among them. That figure is 8004scan's count of
            a population Pokter has never called and is three orders of
            magnitude larger than anything here; a row like this reads as one
            funnel whether or not it is one, and the home page's record is
            where the scopes get named. "Hireable now" is not repeated here
            either — it is in the mark above and on a pill below, and three
            times on one page is twice too many.

            Hidden until an escrow has seen a job: three zeroes above a search
            box is not a track record.
          */}
          {activity.funded > 0 && (
            <ul className="mt-1 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-7 sm:gap-y-2">
              {[
                { value: activity.funded, label: 'outside jobs funded', note: 'Funded through Pokter\u2019s escrow by a buyer that is not Pokter, on either chain.' },
                { value: activity.open, label: 'open now', note: 'Funded or delivered and not yet settled: the escrow is still holding the money.' },
                { value: activity.answered, label: 'outside deliveries', note: 'Settled with the agent\u2019s own answer, with lifecycle demonstrations and self-hires taken out.' },
              ].map((stat) => (
                <li key={stat.label} className="flex items-baseline gap-1.5" title={stat.note}>
                  <span className="t-readout font-medium text-ink">{stat.value}</span>
                  <span className="text-ink-3">{stat.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DiscoverSearch params={base} />
      </header>


      {/* With no results, the not-found message below says it better. */}
      {result.reading && result.total > 0 && (
        <div className="anim-fade mt-6 flex flex-col gap-2 rounded-[12px] border border-rule bg-raised px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-2">
            {result.reading.byName ? (
              <>Agents whose names match &ldquo;{p.q}&rdquo; come first{result.reading.categoryLabel ? `, then ${result.reading.categoryLabel} agents` : ''}{result.reading.terms.length ? ', then agents whose descriptions use your words' : ''}.</>
            ) : result.reading.categoryLabel ? (
              <>
                Reading this as <strong className="font-semibold text-ink">{result.reading.categoryLabel}</strong>
                {result.reading.matched.length > 0 && (
                  <>
                    {' '}
                    from <span className="t-readout text-[12.5px]">{result.reading.matched.map((m) => `“${m}”`).join(', ')}</span>
                  </>
                )}
                . Agents in other categories appear only if their description uses your words.
              </>
            ) : (
              <>No category matched, so results are agents whose descriptions use your words. Try naming the outcome, e.g. &ldquo;liquidation&rdquo; or &ldquo;yield&rdquo;.</>
            )}
          </p>
          <span className="t-label shrink-0">Keyword reading · no AI model</span>
        </div>
      )}
      {result.advanced && result.advanced.unknown.length > 0 && (
        <Notice tone="watch" className="mt-6" title="Some terms were not understood">
          Ignored: <span className="t-readout">{result.advanced.unknown.join(' ')}</span>. See the <Link href="/developers#query" className="link">query syntax</Link>.
        </Notice>
      )}
      {result.unreachable && (
        <Notice tone="watch" className="mt-6" title="The agent registry is not answering">
          Showing only what Pokter could read. Results may be incomplete; nothing has been filled in to hide the gap.
        </Notice>
      )}
      {!result.unreachable && result.incomplete.length > 0 && (
        <Notice tone="watch" className="mt-6" title="Part of the registry did not answer">
          Some reads failed for {result.incomplete.join(', ')}. Agents there may be missing from these results, and counts may be low.
        </Notice>
      )}

      <div className="mt-8 flex flex-col gap-6">
        <FilterBar p={base} counts={result.categoryCounts} allTasks={result.allTasksCount} collections={result.collections} />
        <MobileCategoryBar p={base} counts={result.categoryCounts} allTasks={result.allTasksCount} />

        <section aria-label="Results" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <h2 className="text-[19px] font-medium tracking-[-0.02em]">
                {p.q ? 'Best matches' : 'Recommended agents'}
              </h2>
              <div className="flex items-center gap-3">
              <MobileFilters count={activeFilters}>
                <Filters p={base} counts={result.categoryCounts} allTasks={result.allTasksCount} />
              </MobileFilters>
              <p className="text-sm text-ink-2" aria-live="polite">
                <span className="t-readout text-ink">{result.total}</span> {result.total === 1 ? 'agent' : 'agents'}
              </p>
              {activeFilters > 0 && (
                <Link href={discoverHref({ category: null, hireable: false, answering: false, priced: false, checked: false, outsideDelivery: false, evidence: 'any', chain: 'any' }, p)} className="text-[13px] text-ink-3 hover:text-ink" scroll={false}>
                  Clear filters
                </Link>
              )}
              </div>
            </div>
            {/* One way out of a page that reads a query and pages its
                results: the whole catalogue, unpaged. "Verify catalogue"
                and "Outcome rankings" were here and are errands rather
                than a next step — both are still in the footer and on
                their own pages. */}
            <Link href="/agents" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink hover:underline">
              View all agents <Icon.Arrow size={13} />
            </Link>
            {/* Below `lg` the pill bar is not rendered, so sort has to live
                here instead; above it, it sits with the filters. */}
            <SortSelect params={base} className="lg:hidden" />
          </div>

          {result.total === 0 ? (
            <div className="flex flex-col gap-6">
              <EmptyState
                title={p.q ? (result.suggestions?.close.length ? `No agent named “${p.q}”` : `Nothing found for “${p.q}”`) : 'Nothing matches these filters'}
                action={
                  <>
                    <LinkButton href="/discover" intent="secondary" size="s">
                      Clear everything
                    </LinkButton>
                    {p.q && activeFilters > 0 && (
                      <LinkButton href={discoverHref({ category: null, hireable: false, answering: false, priced: false, checked: false, outsideDelivery: false, evidence: 'any', chain: 'any' }, p)} intent="ghost" size="s">
                        Keep the words, drop the filters
                      </LinkButton>
                    )}
                  </>
                }
              >
                {p.q
                  ? result.suggestions?.close.length
                    ? 'No listed agent has that name. These are the closest names Pokter knows.'
                    : 'No listed agent has that name or describes that task. These answered this week and can be hired now.'
                  : 'Loosen a filter to see more.'}
              </EmptyState>
              {result.suggestions && (result.suggestions.close.length > 0 || result.suggestions.active.length > 0) && (
                <section aria-label={result.suggestions.close.length ? 'Did you mean' : 'Hireable now'}>
                  <h2 className="t-label mb-2">{result.suggestions.close.length ? 'Did you mean' : 'Hireable now'}</h2>
                  <div className="ruled">
                    {(result.suggestions.close.length ? result.suggestions.close : result.suggestions.active).map((row) => (
                      <AgentRow key={row.key} row={row} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            [shown.filter((row) => !row.nameOnly), shown.filter((row) => row.nameOnly)].map((group, g) =>
              group.length === 0 ? null : (
                <div key={g} className={g === 1 ? 'mt-10' : undefined}>
                  {g === 1 && (
                    <div className="mb-4 flex flex-col gap-0.5 border-t border-rule pt-5">
                      <h2 className="text-[14px] font-semibold">Also matched by name</h2>
                      <p className="text-[12.5px] text-ink-3">Their names share words with your task, but Pokter has not seen them do it. Listed for completeness, after the agents that match.</p>
                    </div>
                  )}
                  {/* Grid only, for now. `p.view` is deliberately not read:
                      with the toggle gone, honouring a saved ?view=list would
                      put somebody in a layout with no way back out of it. */}
                  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {group.map((row) => (
                      <li key={row.key} className="flex min-w-0 flex-col">
                        <AgentCard row={row} note={withNetworks(row)} deliveryMs={deliveryByKey.get(row.key) ?? null} compare={<CompareToggle agentKey={row.key} variant="checkbox" compact />} />
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )
          )}
          {shown.length < result.total && (
            <div className="mt-8 flex flex-col items-center gap-2">
              <LinkButton href={discoverHref({ pages: p.pages + 1 }, p)} intent="secondary" scroll={false}>
                Show more
              </LinkButton>
              <span className="text-[12.5px] text-ink-3">
                Showing {shown.length} of {result.total}
              </span>
            </div>
          )}
        </section>

        {/* The newest listings, under the results rather than inside them:
            these are not matches for anything that was asked, so they sit
            below the count that closes the search. */}
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
