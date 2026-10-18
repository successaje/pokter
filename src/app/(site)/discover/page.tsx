import type { Metadata } from 'next';
import { shareMetadata } from '@/lib/og/share';
import Link from 'next/link';
import { Suspense } from 'react';

import { RememberDiscoverResults } from '@/features/discover/ReturnToResults';

import { cn } from '@/lib/ui/cn';
import { AgentCard, AgentRow, MiniAgentCard } from '@/features/agents/AgentCard';
import { CompareToggle, CompareTray } from '@/features/compare/CompareControls';
import { DiscoverSearch, MobileFilters, SortSelect } from '@/features/discover/DiscoverControls';
import { discoverHref, PAGE_SIZE, parseDiscoverParams, type DiscoverParams } from '@/features/discover/params';
import { discover } from '@/features/discover/search';
import { deliveryTimes } from '@/lib/agent/delivery-times';
import { outsideActivity } from '@/lib/erc8183/outside-activity';
import { escrowAvailabilityLine } from '@/lib/network/presentation';
import { EmptyState, Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { LinkButton } from '@/ui/Button';

export const metadata: Metadata = {
  title: 'Discover agents',
  description: 'Search AI agents on BNB Chain by the task you need done, with availability, signed prices and evidence on every result.',
  ...shareMetadata({
    title: 'Discover AI agents on BNB Chain',
    description: 'Search by the task you need done, with availability, signed prices and evidence on every result.',
  }),
};

export const dynamic = 'force-dynamic';

function FilterLink({ href, on, children, count }: { href: string; on: boolean; children: React.ReactNode; count?: number }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={on ? 'true' : undefined}
      className={cn(
        'flex h-9 items-center justify-between gap-3 rounded-[8px] px-2.5 text-[13.5px] transition-colors',
        on ? 'bg-ink font-medium text-paper' : 'text-ink-2 hover:bg-sunken hover:text-ink',
      )}
    >
      <span className="flex items-center gap-2">{children}</span>
      {count !== undefined && <span className={cn('t-readout text-[11.5px]', on ? 'text-paper/70' : 'text-ink-3')}>{count}</span>}
    </Link>
  );
}

function Toggle({ href, on, label, hint }: { href: string; on: boolean; label: string; hint: string }) {
  return (
    <Link href={href} scroll={false} role="switch" aria-checked={on} className="group flex items-start gap-3 rounded-[8px] px-2.5 py-2 hover:bg-sunken">
      <span className={cn('relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full transition-colors', on ? 'bg-ink' : 'bg-rule-strong')}>
        <span className={cn('absolute top-[2px] size-[14px] rounded-full bg-raised transition-[left] duration-200', on ? 'left-[16px]' : 'left-[2px]')} />
      </span>
      <span className="flex flex-col">
        <span className="text-[13.5px] font-medium text-ink">{label}</span>
        <span className="text-[12px] leading-snug text-ink-3">{hint}</span>
      </span>
    </Link>
  );
}

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

function Pill({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={on ? 'true' : undefined}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
        on ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-2 hover:border-ink hover:text-ink',
      )}
    >
      {children}
    </Link>
  );
}

/**
 * The same filters as the rail, laid along the top.
 *
 * The rail cost a fixed 232px of every wide screen and the results paid for
 * it: three cards where four fit, each one narrower than its own contents, so
 * names and prices truncated while a column of mostly-inactive filters sat
 * beside them. Along the top the filters take two lines and give the width
 * back.
 *
 * Counts come with the task pills and nowhere else. On a toggle the number
 * that matters is how many results remain, which the header already says; on
 * a task it is how many exist under it, which is the thing being chosen
 * between.
 *
 * Below `lg` this is not rendered at all and `MobileFilters` keeps the rail
 * in a sheet, because sixteen task pills wrap to half a phone screen before
 * a single result is visible.
 */
function Tally({ n, on }: { n: number; on: boolean }) {
  return <span className={cn('t-readout text-[11.5px]', on ? 'text-paper/70' : 'text-ink-3')}>{n}</span>;
}

function FilterBar({
  p,
  counts,
  allTasks,
  collections,
}: {
  p: DiscoverParams;
  counts: Array<{ id: string; label: string; count: number }>;
  allTasks: number;
  collections: { hireable: number; priced: number; answering: number; corroborated: number };
}) {
  return (
    <div className="hidden flex-col gap-2.5 lg:flex" aria-label="Filters">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Availability">
          <Pill href={discoverHref({ hireable: !p.hireable }, p)} on={p.hireable}>{p.hireable && <Icon.Check size={13} />}Hireable now <Tally n={collections.hireable} on={p.hireable} /></Pill>
          <Pill href={discoverHref({ answering: !p.answering }, p)} on={p.answering}>{p.answering && <Icon.Check size={13} />}Answered this week <Tally n={collections.answering} on={p.answering} /></Pill>
          <Pill href={discoverHref({ priced: !p.priced }, p)} on={p.priced}>{p.priced && <Icon.Check size={13} />}Has a signed price <Tally n={collections.priced} on={p.priced} /></Pill>
        </div>
        <span aria-hidden className="h-5 w-px bg-rule" />
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Evidence">
          {/* Short enough that sort fits on this line rather than wrapping
              under it. "Attested by others" is what the collection tab
              called this before it became a pill, so it is the shorter
              label and the one already in the product's vocabulary. */}
          <Pill href={discoverHref({ evidence: 'any' }, p)} on={p.evidence === 'any'}>Any</Pill>
          <Pill href={discoverHref({ evidence: 'measured' }, p)} on={p.evidence === 'measured'}>Measured by Pokter</Pill>
          <Pill href={discoverHref({ evidence: 'corroborated' }, p)} on={p.evidence === 'corroborated'}>Attested by others <Tally n={collections.corroborated} on={p.evidence === 'corroborated'} /></Pill>
        </div>
        {/* The tasks moved to the line below and left this one's right end
            empty, which is where sort belongs: it governs the results, not
            the filters, and it was wedged against a network switch and a
            layout toggle that are both gone. */}
        <SortSelect params={p} className="ml-auto" />
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Task">
        <Pill href={discoverHref({}, p, ['category'])} on={!p.category}>
          All tasks <span className={cn('t-readout text-[11.5px]', p.category ? 'text-ink-3' : 'text-paper/70')}>{allTasks}</span>
        </Pill>
        {counts.map((c) => (
          <Pill key={c.id} href={discoverHref({ category: c.id as DiscoverParams['category'] }, p)} on={p.category === c.id}>
            {c.label} <span className={cn('t-readout text-[11.5px]', p.category === c.id ? 'text-paper/70' : 'text-ink-3')}>{c.count}</span>
          </Pill>
        ))}
      </div>
    </div>
  );
}

function Filters({ p, counts, allTasks }: { p: DiscoverParams; counts: Array<{ id: string; label: string; count: number }>; allTasks: number }) {
  // Counted under the same filters as the results; the sum of the tasks
  // left out agents in no task, so it never matched the list.
  const total = allTasks;
  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-1" aria-label="Task">
        <h2 className="t-label mb-1.5 px-2.5">Task</h2>
        <FilterLink href={discoverHref({}, p, ['category'])} on={!p.category} count={total}>
          All tasks
        </FilterLink>
        {counts.map((c) => (
          <FilterLink key={c.id} href={discoverHref({ category: c.id as DiscoverParams['category'] }, p)} on={p.category === c.id} count={c.count}>
            {c.label}
          </FilterLink>
        ))}
      </section>
      <section className="flex flex-col gap-1" aria-label="Availability">
        <h2 className="t-label mb-1.5 px-2.5">Availability</h2>
        <Toggle href={discoverHref({ hireable: !p.hireable }, p)} on={p.hireable} label="Hireable now" hint="Answering, and payable through escrow" />
        <Toggle href={discoverHref({ answering: !p.answering }, p)} on={p.answering} label="Answered this week" hint="Replied to a Pokter probe in 7 days" />
        <Toggle href={discoverHref({ priced: !p.priced }, p)} on={p.priced} label="Has a signed price" hint="Named a price, signed by its wallet" />
      </section>
      <section className="flex flex-col gap-1" aria-label="Evidence">
        <h2 className="t-label mb-1.5 px-2.5">Evidence</h2>
        <FilterLink href={discoverHref({ evidence: 'any' }, p)} on={p.evidence === 'any'}>
          Any
        </FilterLink>
        <FilterLink href={discoverHref({ evidence: 'measured' }, p)} on={p.evidence === 'measured'}>
          Measured by Pokter
        </FilterLink>
        <FilterLink href={discoverHref({ evidence: 'corroborated' }, p)} on={p.evidence === 'corroborated'}>
          Has published attestations
        </FilterLink>
      </section>
      <p className="px-2.5 text-[12px] leading-relaxed text-ink-3">
        Power search: <span className="t-readout">is:reliable</span>, <span className="t-readout">has:price</span>,{' '}
        <span className="t-readout">has:probes&gt;10</span>. <Link href="/developers#query" className="link">Syntax</Link>
      </p>
    </div>
  );
}

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
  const timed = await Promise.all(
    shown
      .filter((row) => row.paid.delivered > 0)
      .map(async (row) => [row.key, (await deliveryTimes(row.chainId, row.tokenId).catch(() => null))?.medianMs ?? null] as const),
  );
  const deliveryByKey = new Map(timed);
  const activity = outsideActivity();
  const activeFilters = [p.category, p.hireable, p.answering, p.priced, p.evidence !== 'any', p.chain !== 'any'].filter(Boolean).length;

  return (
    <div className="frame pb-24 pt-8 sm:pt-12">
      <Suspense>
        <RememberDiscoverResults />
      </Suspense>
      <header className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          {/* What is switched on, and how much of the catalogue can be hired
              through it, before the name of the page. Both read from the
              same sources the results below do. */}
          <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
            <span className="inline-flex h-7 items-center gap-2 rounded-full border border-ok/30 bg-ok-wash px-3 text-ok">
              <span aria-hidden className="size-1.5 rounded-full bg-ok" />
              {escrowAvailabilityLine() ?? 'The agent marketplace for BNB Chain'}
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
          <h1 className="t-h1">Discover agents</h1>
          <p className="t-body max-w-2xl text-ink-2">
            Describe the job in your own words. Pokter reads it for intent, then shows agents with their availability, evidence and signed price, never a score it cannot back.
          </p>
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
            <ul className="flex flex-wrap items-baseline gap-x-7 gap-y-2 text-[13px]">
              {[
                { value: activity.funded, label: 'jobs funded', note: 'Funded through Pokter\u2019s escrow by a buyer that is not Pokter, on either chain.' },
                { value: activity.open, label: 'open now', note: 'Funded or delivered and not yet settled: the escrow is still holding the money.' },
                { value: activity.answered, label: 'delivered', note: 'Settled with the agent\u2019s own answer, with lifecycle demonstrations and self-hires taken out.' },
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

        <section aria-label="Results" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4">
            <div className="flex items-center gap-3">
              <MobileFilters count={activeFilters}>
                <Filters p={base} counts={result.categoryCounts} allTasks={result.allTasksCount} />
              </MobileFilters>
              <p className="text-sm text-ink-2" aria-live="polite">
                <span className="t-readout text-ink">{result.total}</span> {result.total === 1 ? 'agent' : 'agents'}
              </p>
              {activeFilters > 0 && (
                <Link href={discoverHref({ category: null, hireable: false, answering: false, priced: false, evidence: 'any', chain: 'any' }, p)} className="text-[13px] text-ink-3 hover:text-ink" scroll={false}>
                  Clear filters
                </Link>
              )}
            </div>
            {/* Under sort, where the network switch and the layout toggle
                used to be. They are about the whole catalogue rather than
                this page's title, so they sit with the results. */}
            <div className="flex flex-wrap items-center gap-4">
              <a href="/api/v1/agents/verifier" download className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink hover:underline">Verify catalogue <Icon.Arrow size={13} /></a>
              <Link href="/rankings" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink hover:underline">Outcome rankings <Icon.Arrow size={13} /></Link>
            </div>
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
                      <LinkButton href={discoverHref({ category: null, hireable: false, answering: false, priced: false, evidence: 'any', chain: 'any' }, p)} intent="ghost" size="s">
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
      </div>
      <CompareTray />
    </div>
  );
}
