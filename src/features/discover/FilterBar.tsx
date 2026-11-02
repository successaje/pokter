import Link from 'next/link';

import { cn } from '@/lib/ui/cn';
import { discoverHref, type DiscoverParams } from './params';
import { FiltersButton, PillRow } from './DiscoverControls';
import type { FilterCounts } from './search';
import { chainLabel } from '@/lib/network/presentation';
import { Icon } from '@/ui/icons';
import { CHECK_FRESH_DAYS } from '@/lib/assay/standing';
import type { Category } from '@/lib/agents/categories';

/*
 * The catalogue's filters, shared by Discover and the full listing.
 *
 * Lifted out of the Discover page when a second surface needed the same
 * controls. Copying them would have been the cheaper edit and the two sets
 * would have disagreed inside a release: the counts, the labels and the
 * vocabulary each have a reason behind them that is not visible from the
 * markup.
 *
 * A filter whose count is 0 and that is off is shown, dimmed, but is not a
 * link: clicking it could only show nothing.
 */

const DEAD = 'None under the filters that are on';

/** Broad work first, then related DeFi specialties, with the catch-all last. */
const CATEGORY_ORDER: Record<Category | 'unclassified', number> = {
  research: 0,
  content: 1,
  trading: 2,
  'grid-trading': 3,
  yield: 4,
  rebalancing: 5,
  'health-factor': 6,
  'token-safety': 7,
  unclassified: 8,
};

/** Off, and nothing would show if it were on. */
const dead = (on: boolean, count?: number) => !on && count === 0;

function FilterLink({ href, on, children, count }: { href: string; on: boolean; children: React.ReactNode; count?: number }) {
  if (dead(on, count)) {
    return (
      <span aria-disabled="true" title={DEAD} className="flex h-9 items-center justify-between gap-3 rounded-[8px] px-2.5 text-[13.5px] text-ink-3 opacity-60">
        <span className="flex items-center gap-2">{children}</span>
        <span className="t-readout text-[11.5px]">0</span>
      </span>
    );
  }
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
  const inside = (
    <>
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
    </>
  );
  if (dead(on, count)) {
    return (
      <span role="switch" aria-checked={false} aria-disabled="true" title={DEAD} className="flex items-start gap-3 rounded-[8px] px-2.5 py-2 opacity-50">
        {inside}
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} role="switch" aria-checked={on} className="group flex items-start gap-3 rounded-[8px] px-2.5 py-2 hover:bg-sunken">
      {inside}
    </Link>
  );
}

const PILL = 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors';

export function Pill({ href, on, count, children }: { href: string; on: boolean; count?: number; children: React.ReactNode }) {
  if (dead(on, count)) {
    return (
      <span aria-disabled="true" title={DEAD} className={cn(PILL, 'cursor-default border-rule text-ink-3 opacity-60')}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={on ? 'true' : undefined}
      className={cn(PILL, on ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-2 hover:border-ink hover:text-ink')}
    >
      {children}
    </Link>
  );
}

export function Tally({ n, on }: { n: number; on: boolean }) {
  return <span className={cn('t-readout text-[11.5px]', on ? 'text-paper/70' : 'text-ink-3')}>{n}</span>;
}

/** The buyer signals, named once for the row and the panel. Each one narrows; any number can be on. */
const SIGNALS = [
  { key: 'hireable', label: 'Hireable via escrow', hint: 'Answering, and payable through escrow' },
  { key: 'priced', label: 'Has an escrow quote', hint: 'Has signed an escrow price with its wallet, current or expired' },
  { key: 'outsideDelivery', label: 'Outside buyer delivered', hint: 'Settled work funded outside Pokter’s team' },
  { key: 'checked', label: 'Correctness checked', hint: `Passed its category’s latest check in the last ${CHECK_FRESH_DAYS} days` },
  { key: 'answering', label: 'Answered this week', hint: 'Replied to a Pokter probe in 7 days' },
] as const satisfies ReadonlyArray<{ key: keyof FilterCounts & keyof DiscoverParams; label: string; hint: string }>;

/** A buyer signal on the row: a pill that shows a check while it is on, and explains itself on hover. */
function SignalPill({ href, on, label, hint, count }: { href: string; on: boolean; label: string; hint: string; count: number }) {
  if (dead(on, count)) {
    return (
      <span role="switch" aria-checked={false} aria-disabled="true" title={`${hint}. ${DEAD}.`} className={cn(PILL, 'cursor-default border-rule text-ink-3 opacity-60')}>
        {label} <Tally n={0} on={false} />
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      role="switch"
      aria-checked={on}
      title={hint}
      className={cn(PILL, on ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-2 hover:border-ink hover:text-ink')}
    >
      {on && <Icon.Check size={13} aria-hidden />}
      {label} <Tally n={count} on={on} />
    </Link>
  );
}

/** Each filter that is on and has no pill on the row, by the name the panel gives it, with the link that turns it off. */
export function activeFilterChips(p: DiscoverParams): Array<{ label: string; href: string }> {
  return [
    p.evidence === 'measured' && { label: 'Measured by Pokter', href: discoverHref({ evidence: 'any' }, p) },
    p.evidence === 'corroborated' && { label: 'Has published attestations', href: discoverHref({ evidence: 'any' }, p) },
    p.chain !== 'any' && { label: `Registered on ${chainLabel(Number(p.chain))}`, href: discoverHref({ chain: 'any' }, p) },
  ].filter((chip): chip is { label: string; href: string } => Boolean(chip));
}

/**
 * The catalogue's filters: tasks and buyer signals share the available width.
 *
 * Behind one Filters button the signals were a click away and the button sat
 * alone on its row, shaped like one more task. The five signals follow the
 * tasks, with a quiet All filters for the rest (the evidence choice
 * and what each filter means). Tasks choose one; signals
 * narrow, any number at once, and show a check while on.
 *
 * Every number beside a filter is what clicking it would show, under
 * everything else that is on (`filterCounts`), so a pill under a chosen task
 * never promises the whole catalogue.
 *
 * On a phone the tasks wrap so every category is visible. Buyer signals
 * remain a single sideways-scrolling row. On larger screens both groups
 * flow through the same wrapping row, so a last task is never stranded.
 */
export function FilterBar({ p, counts, allTasks, filterCounts }: { p: DiscoverParams; counts: Array<{ id: Category | 'unclassified'; label: string; count: number }>; allTasks: number; filterCounts: FilterCounts }) {
  const chips = activeFilterChips(p);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2" role="group" aria-label="Filters">
      <PillRow label="Task" wrapOnMobile inlineOnDesktop>
        <Pill href={discoverHref({}, p, ['category'])} on={!p.category}>
          All tasks <Tally n={allTasks} on={!p.category} />
        </Pill>
        {[...counts].sort((a, b) => CATEGORY_ORDER[a.id] - CATEGORY_ORDER[b.id]).map((c) => (
          <Pill key={c.id} href={discoverHref({ category: c.id }, p)} on={p.category === c.id} count={c.count}>
            {c.label} <Tally n={c.count} on={p.category === c.id} />
          </Pill>
        ))}
      </PillRow>
      <PillRow label="Buyer signals" inlineOnDesktop className="max-sm:w-[calc(100%+2rem)]">
        {SIGNALS.map((signal, index) => {
          const pill = <SignalPill href={discoverHref({ [signal.key]: !p[signal.key] }, p)} on={p[signal.key]} label={signal.label} hint={signal.hint} count={filterCounts[signal.key]} />;
          return index === 0 ? (
            <span key={signal.key} className="inline-flex shrink-0 items-center gap-2">
              <span aria-hidden className="mx-1 hidden h-6 w-px bg-rule-strong sm:block" />
              {pill}
            </span>
          ) : <span key={signal.key} className="shrink-0">{pill}</span>;
        })}
      </PillRow>
      <FiltersButton>
        <Filters p={p} counts={filterCounts} />
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
    </div>
  );
}

/** The panel behind All filters: everything that narrows the results within a task, each with what it means. */
export function Filters({ p, counts }: { p: DiscoverParams; counts: FilterCounts }) {
  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-1" aria-label="Buyer signals">
        <h2 className="t-label mb-1.5 px-2.5">Buyer signals</h2>
        {SIGNALS.map((signal) => (
          <Toggle key={signal.key} href={discoverHref({ [signal.key]: !p[signal.key] }, p)} on={p[signal.key]} label={signal.label} count={counts[signal.key]} hint={signal.hint} />
        ))}
      </section>
      <section className="flex flex-col gap-1" aria-label="Evidence">
        <h2 className="t-label mb-1.5 px-2.5">Evidence</h2>
        <FilterLink href={discoverHref({ evidence: 'any' }, p)} on={p.evidence === 'any'} count={counts.anyEvidence}>
          Any
        </FilterLink>
        <FilterLink href={discoverHref({ evidence: 'measured' }, p)} on={p.evidence === 'measured'} count={counts.measured}>
          Measured by Pokter
        </FilterLink>
        <FilterLink href={discoverHref({ evidence: 'corroborated' }, p)} on={p.evidence === 'corroborated'} count={counts.corroborated}>
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
