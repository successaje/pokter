import Link from 'next/link';

import { cn } from '@/lib/ui/cn';
import { discoverHref, type DiscoverParams } from './params';
import { FiltersButton, SortSelect } from './DiscoverControls';
import { chainLabel } from '@/lib/network/presentation';
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

function Toggle({ href, on, label, hint, count }: { href: string; on: boolean; label: string; hint: string; count?: number }) {
  return (
    <Link href={href} scroll={false} role="switch" aria-checked={on} className="group flex items-start gap-3 rounded-[8px] px-2.5 py-2 hover:bg-sunken">
      <span className={cn('relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full transition-colors motion-reduce:transition-none', on ? 'bg-ink' : 'bg-rule-strong')}>
        <span className={cn('absolute top-[2px] size-[14px] rounded-full bg-raised transition-[left] duration-200 motion-reduce:transition-none', on ? 'left-[16px]' : 'left-[2px]')} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline justify-between gap-3 text-[13.5px] font-medium text-ink">
          {label}
          {count !== undefined && <span className="t-readout text-[11.5px] font-normal text-ink-3">{count}</span>}
        </span>
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

export function Tally({ n, on }: { n: number; on: boolean }) {
  return <span className={cn('t-readout text-[11.5px]', on ? 'text-paper/70' : 'text-ink-3')}>{n}</span>;
}

type Collections = { hireable: number; priced: number; answering: number; checked: number; outsideDelivery: number; corroborated: number };

/** Each filter that is on, by the name the Filters panel gives it, with the link that turns it off. */
export function activeFilterChips(p: DiscoverParams): Array<{ label: string; href: string }> {
  return [
    p.hireable && { label: 'Hireable via escrow', href: discoverHref({ hireable: false }, p) },
    p.priced && { label: 'Has an escrow quote', href: discoverHref({ priced: false }, p) },
    p.outsideDelivery && { label: 'Outside buyer delivered', href: discoverHref({ outsideDelivery: false }, p) },
    p.checked && { label: 'Correctness checked', href: discoverHref({ checked: false }, p) },
    p.answering && { label: 'Answered this week', href: discoverHref({ answering: false }, p) },
    p.evidence === 'measured' && { label: 'Measured by Pokter', href: discoverHref({ evidence: 'any' }, p) },
    p.evidence === 'corroborated' && { label: 'Has published attestations', href: discoverHref({ evidence: 'any' }, p) },
    p.chain !== 'any' && { label: `Registered on ${chainLabel(Number(p.chain))}`, href: discoverHref({ chain: 'any' }, p) },
  ].filter((chip): chip is { label: string; href: string } => Boolean(chip));
}

/**
 * The catalogue's filters: the tasks, then one Filters control.
 *
 * The rail cost a fixed 232px of every wide screen, so it moved along the
 * top, where it grew to three rows of pills: five buyer signals, three
 * evidence choices and the tasks, all at one weight above the results.
 * Now the tasks stay as pills, because choosing a task is choosing what to
 * look at, and everything that narrows within it sits behind one Filters
 * button, with each one that is on shown as a chip that removes it. The
 * same layout on every width, so a phone and a laptop describe the
 * catalogue the same way.
 *
 * Counts come with the tasks and inside the panel. On a filter that is on,
 * the number that matters is how many results remain, which the heading
 * below says.
 */
export function FilterBar({ p, counts, allTasks, collections }: { p: DiscoverParams; counts: Array<{ id: string; label: string; count: number }>; allTasks: number; collections: Collections }) {
  const chips = activeFilterChips(p);
  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Filters">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Task">
        <Pill href={discoverHref({}, p, ['category'])} on={!p.category}>
          All tasks <Tally n={allTasks} on={!p.category} />
        </Pill>
        {counts.map((c) => (
          <Pill key={c.id} href={discoverHref({ category: c.id as DiscoverParams['category'] }, p)} on={p.category === c.id}>
            {c.label} <Tally n={c.count} on={p.category === c.id} />
          </Pill>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FiltersButton count={chips.length}>
          <Filters p={p} collections={collections} />
        </FiltersButton>
        {chips.map((chip) => (
          <Link
            key={chip.label}
            href={chip.href}
            scroll={false}
            aria-label={`Remove filter: ${chip.label}`}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 text-[13px] font-medium text-paper hover:bg-ink/85"
          >
            {chip.label}
            <Icon.Cross size={12} aria-hidden />
          </Link>
        ))}
        <SortSelect params={p} variant="inline" className="ml-auto" />
      </div>
    </div>
  );
}

/** The panel behind the Filters button: what narrows the results within a task, each with what it means. */
export function Filters({ p, collections }: { p: DiscoverParams; collections: Collections }) {
  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-1" aria-label="Buyer signals">
        <h2 className="t-label mb-1.5 px-2.5">Buyer signals</h2>
        <Toggle href={discoverHref({ hireable: !p.hireable }, p)} on={p.hireable} label="Hireable via escrow" count={collections.hireable} hint="Answering, and payable through escrow" />
        <Toggle href={discoverHref({ priced: !p.priced }, p)} on={p.priced} label="Has an escrow quote" count={collections.priced} hint="Has signed an escrow price with its wallet, current or expired" />
        <Toggle href={discoverHref({ outsideDelivery: !p.outsideDelivery }, p)} on={p.outsideDelivery} label="Outside buyer delivered" count={collections.outsideDelivery} hint="Settled work funded outside Pokter’s team" />
        <Toggle href={discoverHref({ checked: !p.checked }, p)} on={p.checked} label="Correctness checked" count={collections.checked} hint="Passed the latest check for its category" />
        <Toggle href={discoverHref({ answering: !p.answering }, p)} on={p.answering} label="Answered this week" count={collections.answering} hint="Replied to a Pokter probe in 7 days" />
      </section>
      <section className="flex flex-col gap-1" aria-label="Evidence">
        <h2 className="t-label mb-1.5 px-2.5">Evidence</h2>
        <FilterLink href={discoverHref({ evidence: 'any' }, p)} on={p.evidence === 'any'}>
          Any
        </FilterLink>
        <FilterLink href={discoverHref({ evidence: 'measured' }, p)} on={p.evidence === 'measured'}>
          Measured by Pokter
        </FilterLink>
        <FilterLink href={discoverHref({ evidence: 'corroborated' }, p)} on={p.evidence === 'corroborated'} count={collections.corroborated}>
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
