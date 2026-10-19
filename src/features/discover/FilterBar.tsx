import Link from 'next/link';

import { cn } from '@/lib/ui/cn';
import { discoverHref, type DiscoverParams } from './params';
import { SortSelect } from './DiscoverControls';
import { Icon } from '@/ui/icons';

/*
 * The catalogue's filters, shared by Discover and the full listing.
 *
 * Lifted out of the Discover page when a second surface needed the same
 * controls. Copying them would have been the cheaper edit and the two sets
 * would have disagreed inside a release: the counts, the labels and the
 * vocabulary each have a reason behind them that is not visible from the
 * markup.
 */

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

export function Pill({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
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
export function Tally({ n, on }: { n: number; on: boolean }) {
  return <span className={cn('t-readout text-[11.5px]', on ? 'text-paper/70' : 'text-ink-3')}>{n}</span>;
}

export function FilterBar({
  p,
  counts,
  allTasks,
  collections,
}: {
  p: DiscoverParams;
  counts: Array<{ id: string; label: string; count: number }>;
  allTasks: number;
  collections: { hireable: number; priced: number; answering: number; checked: number; outsideDelivery: number; corroborated: number };
}) {
  return (
    <div className="hidden flex-col gap-2.5 lg:flex" aria-label="Filters">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Buyer signals">
          <Pill href={discoverHref({ hireable: !p.hireable }, p)} on={p.hireable}>{p.hireable && <Icon.Check size={13} />}Hireable now <Tally n={collections.hireable} on={p.hireable} /></Pill>
          <Pill href={discoverHref({ priced: !p.priced }, p)} on={p.priced}>{p.priced && <Icon.Check size={13} />}Has a signed price <Tally n={collections.priced} on={p.priced} /></Pill>
          <Pill href={discoverHref({ outsideDelivery: !p.outsideDelivery }, p)} on={p.outsideDelivery}>{p.outsideDelivery && <Icon.Check size={13} />}Outside buyer delivered <Tally n={collections.outsideDelivery} on={p.outsideDelivery} /></Pill>
          <Pill href={discoverHref({ checked: !p.checked }, p)} on={p.checked}>{p.checked && <Icon.Check size={13} />}Correctness checked <Tally n={collections.checked} on={p.checked} /></Pill>
          <Pill href={discoverHref({ answering: !p.answering }, p)} on={p.answering}>{p.answering && <Icon.Check size={13} />}Answered this week <Tally n={collections.answering} on={p.answering} /></Pill>
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

/**
 * The phone's filters, laid out in the page rather than behind a button.
 *
 * Everything sat in a sheet behind "Filters" and the tasks scrolled sideways
 * in one row, so a buyer on a phone saw neither what they could narrow by
 * nor most of the tasks. There are five tasks, which wrap to two short rows,
 * and the four buyer signals are the filters that decide a hire, so both
 * are shown. The rest — answered this week, evidence, network — stay one
 * tap away under "More filters". Sort closes the block, since it governs
 * the results below it.
 */
export function MobileFilterBlock({
  p,
  counts,
  allTasks,
  collections,
  more,
}: {
  p: DiscoverParams;
  counts: Array<{ id: string; label: string; count: number }>;
  allTasks: number;
  collections: { hireable: number; priced: number; outsideDelivery: number; checked: number };
  more: React.ReactNode;
}) {
  return (
    <div className="-mx-4 flex flex-col gap-4 border-y border-rule px-4 py-5 lg:hidden" aria-label="Filters">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Task">
        <Pill href={discoverHref({}, p, ['category'])} on={!p.category}>All <Tally n={allTasks} on={!p.category} /></Pill>
        {counts.map((category) => (
          <Pill key={category.id} href={discoverHref({ category: category.id as DiscoverParams['category'] }, p)} on={p.category === category.id}>
            {category.label} <Tally n={category.count} on={p.category === category.id} />
          </Pill>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Buyer signals">
        <Pill href={discoverHref({ hireable: !p.hireable }, p)} on={p.hireable}>{p.hireable && <Icon.Check size={13} />}Hireable now <Tally n={collections.hireable} on={p.hireable} /></Pill>
        <Pill href={discoverHref({ priced: !p.priced }, p)} on={p.priced}>{p.priced && <Icon.Check size={13} />}Signed price <Tally n={collections.priced} on={p.priced} /></Pill>
        <Pill href={discoverHref({ outsideDelivery: !p.outsideDelivery }, p)} on={p.outsideDelivery}>{p.outsideDelivery && <Icon.Check size={13} />}Outside buyer delivered <Tally n={collections.outsideDelivery} on={p.outsideDelivery} /></Pill>
        <Pill href={discoverHref({ checked: !p.checked }, p)} on={p.checked}>{p.checked && <Icon.Check size={13} />}Checked <Tally n={collections.checked} on={p.checked} /></Pill>
        {more}
        <SortSelect params={p} variant="inline" className="ml-auto" />
      </div>
    </div>
  );
}

export function Filters({ p, counts, allTasks }: { p: DiscoverParams; counts: Array<{ id: string; label: string; count: number }>; allTasks: number }) {
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
      <section className="flex flex-col gap-1" aria-label="Buyer signals">
        <h2 className="t-label mb-1.5 px-2.5">Buyer signals</h2>
        <Toggle href={discoverHref({ hireable: !p.hireable }, p)} on={p.hireable} label="Hireable now" hint="Answering, and payable through escrow" />
        <Toggle href={discoverHref({ priced: !p.priced }, p)} on={p.priced} label="Has a signed price" hint="Named a price, signed by its wallet" />
        <Toggle href={discoverHref({ outsideDelivery: !p.outsideDelivery }, p)} on={p.outsideDelivery} label="Outside buyer delivered" hint="Settled work funded outside Pokter’s team" />
        <Toggle href={discoverHref({ checked: !p.checked }, p)} on={p.checked} label="Correctness checked" hint="Passed the latest check for its category" />
        <Toggle href={discoverHref({ answering: !p.answering }, p)} on={p.answering} label="Answered this week" hint="Replied to a Pokter probe in 7 days" />
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
