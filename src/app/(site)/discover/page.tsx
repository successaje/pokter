import type { Metadata } from 'next';
import { shareMetadata } from '@/lib/og/share';
import Link from 'next/link';
import { Suspense } from 'react';

import { RememberDiscoverResults } from '@/features/discover/ReturnToResults';

import { CATEGORIES } from '@/lib/agents/categories';
import { cn } from '@/lib/ui/cn';
import { AgentCard, AgentRow } from '@/features/agents/AgentCard';
import { CompareToggle, CompareTray } from '@/features/compare/CompareControls';
import { DiscoverSearch, MobileFilters, SortSelect } from '@/features/discover/DiscoverControls';
import { discoverHref, PAGE_SIZE, parseDiscoverParams, type DiscoverParams } from '@/features/discover/params';
import { discover } from '@/features/discover/search';
import { OUTCOMES } from '@/features/home/outcomes';
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
function withNetworks(row: { reason: string | null; alsoOn: number[] }): string | null {
  const also = row.alsoOn.includes(97) ? 'Also on testnet' : row.alsoOn.includes(56) ? 'Also on BNB Chain' : null;
  return [row.reason, also].filter(Boolean).join(' · ') || null;
}

function NetworkSwitch({ p }: { p: DiscoverParams }) {
  const options: Array<{ chain: DiscoverParams['chain']; label: string }> = [
    { chain: 'any', label: 'All networks' },
    { chain: '56', label: 'BNB Chain' },
    { chain: '97', label: 'Testnet' },
  ];
  /*
   * Labelled, because the word alone is ambiguous and the ambiguity reads
   * as a broken filter. Selecting "BNB Chain" lists agents registered on
   * chain 56, and most of those signed a price in testnet $U — so their
   * cards correctly say "Test tokens · BNB Testnet", and a buyer sees a
   * BNB Chain filter returning testnet agents. Both facts are true; only
   * the heading was missing. The tooltip said this already, and a tooltip
   * is not where a filter explains itself.
   */
  return (
    <div className="flex items-center gap-2">
      <span className="t-label shrink-0 text-ink-3">Registered on</span>
      <div className="flex rounded-[8px] border border-rule-strong p-0.5" role="group" aria-label="Registered on" title="Where the agent’s identity lives. Each agent’s card says which money a hire of it settles in, which is often the other network.">
      {options.map((o) => (
        <Link
          key={o.chain}
          href={discoverHref({ chain: o.chain }, p)}
          scroll={false}
          aria-current={p.chain === o.chain ? 'true' : undefined}
          className={cn('inline-flex h-7 items-center rounded-[6px] px-2.5 text-[12.5px] font-medium', p.chain === o.chain ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink')}
        >
          {o.label}
        </Link>
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
  const activeFilters = [p.category, p.hireable, p.answering, p.priced, p.evidence !== 'any', p.chain !== 'any'].filter(Boolean).length;

  return (
    <div className="frame pb-24 pt-8 sm:pt-12">
      <Suspense>
        <RememberDiscoverResults />
      </Suspense>
      <header className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="t-h1">Discover agents</h1>
            <div className="flex flex-wrap items-center gap-4">
              <a href="/api/v1/agents/verifier" download className="inline-flex items-center gap-1 text-sm font-medium hover:underline">Verify catalogue <Icon.Arrow size={14} /></a>
              <Link href="/rankings" className="inline-flex items-center gap-1 text-sm font-medium hover:underline">Outcome rankings <Icon.Arrow size={14} /></Link>
            </div>
          </div>
          <p className="t-body max-w-2xl text-ink-2">
            Describe the job in your own words. Pokter reads it for intent, then shows agents with their availability, evidence and signed price, never a score it cannot back.
          </p>
        </div>
        {/*
          The collections as tabs: one choice of scope, always visible, the
          active one underlined. Each keeps the search, task, network and
          sort, and replaces the other three shortcuts rather than stacking.
        */}
        <nav aria-label="Collections" className="no-scrollbar -mx-4 overflow-x-auto border-b border-rule px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-1">
            {[
              { key: 'all', title: 'All agents', note: 'Everything Pokter lists', set: {}, count: null as number | null },
              { key: 'hireable', title: 'Hireable now', note: 'Answering and payable through escrow', set: { hireable: true }, count: result.collections.hireable },
              { key: 'priced', title: 'Signed a price', note: 'Price signed by the agent’s wallet', set: { priced: true }, count: result.collections.priced },
              { key: 'answering', title: 'Answered this week', note: 'Replied to a Pokter probe in 7 days', set: { answering: true }, count: result.collections.answering },
              { key: 'corroborated', title: 'Attested by others', note: 'Has published on-chain attestations', set: { evidence: 'corroborated' as const }, count: result.collections.corroborated },
            ].map((tab) => {
              const scope = { hireable: p.hireable, priced: p.priced, answering: p.answering, corroborated: p.evidence === 'corroborated' };
              const on = tab.key === 'all' ? !Object.values(scope).some(Boolean) : scope[tab.key as keyof typeof scope] && Object.values(scope).filter(Boolean).length === 1;
              return (
                <li key={tab.key} className="shrink-0">
                  <Link
                    href={discoverHref({ hireable: false, priced: false, answering: false, evidence: 'any', ...tab.set }, base)}
                    title={tab.note}
                    aria-current={on ? 'page' : undefined}
                    scroll={false}
                    className={cn(
                      '-mb-px inline-flex h-11 items-center gap-2 border-b-2 px-3 text-[14px] font-medium transition-colors',
                      on ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink',
                    )}
                  >
                    {tab.title}
                    {tab.count !== null && <span className={cn('t-readout text-[12px]', on ? 'text-ok' : 'text-ink-3')}>{tab.count}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <DiscoverSearch params={base} />
        {!p.q && (
          <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Start from an outcome">
            {CATEGORIES.map((c) => (
              <li key={c.id} className="shrink-0">
                <Link href={discoverHref({ q: OUTCOMES[c.id].query }, p)} className="inline-flex h-8 items-center rounded-full border border-rule bg-paper px-3 text-[13px] text-ink-2 hover:border-ink hover:text-ink">
                  {OUTCOMES[c.id].verb}
                </Link>
              </li>
            ))}
          </ul>
        )}
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

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-20">
            <Filters p={base} counts={result.categoryCounts} allTasks={result.allTasksCount} />
          </div>
        </aside>

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
            <div className="flex flex-wrap items-center gap-2">
              <NetworkSwitch p={base} />
              <SortSelect params={base} />
              <div className="flex rounded-[8px] border border-rule-strong p-0.5" role="group" aria-label="Layout">
                <Link href={discoverHref({ view: 'grid' }, p)} scroll={false} aria-label="Grid view" aria-current={p.view === 'grid' ? 'true' : undefined} className={cn('grid size-7 place-items-center rounded-[6px]', p.view === 'grid' ? 'bg-sunken text-ink' : 'text-ink-3')}>
                  <Icon.Grid size={15} />
                </Link>
                <Link href={discoverHref({ view: 'list' }, p)} scroll={false} aria-label="List view" aria-current={p.view === 'list' ? 'true' : undefined} className={cn('grid size-7 place-items-center rounded-[6px]', p.view === 'list' ? 'bg-sunken text-ink' : 'text-ink-3')}>
                  <Icon.List size={15} />
                </Link>
              </div>
            </div>
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
          ) : p.view === 'list' ? (
            <div className="ruled">
              {shown.map((row) => (
                <AgentRow key={row.key} row={row} reason={withNetworks(row) ?? undefined} trailing={<CompareToggle agentKey={row.key} className="relative z-10 hidden sm:inline-flex" />} />
              ))}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((row) => (
                <li key={row.key} className="flex min-w-0 flex-col">
                  <AgentCard row={row} note={withNetworks(row)} compare={<CompareToggle agentKey={row.key} variant="checkbox" />} />
                </li>
              ))}
            </ul>
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
      </div>
      <CompareTray />
    </div>
  );
}
