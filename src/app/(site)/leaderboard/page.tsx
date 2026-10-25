import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { CATEGORY_BY_ID, type Classification } from '@/lib/agents/categories';
import { escrowCommerceAddress } from '@/lib/erc8183/addresses';
import type { HiredJob } from '@/lib/erc8183/types';
import { jobReceipt } from '@/lib/jobs/receipt-link';
import {
  ALL_CATEGORIES,
  browseQueryFrom,
  browseSummary,
  categoryCounts,
  matchesBrowse,
  pageLinks,
  pageOf,
  type BrowseQuery,
  type Page,
} from '@/lib/leaderboard/browse';
import {
} from '@/lib/leaderboard/consistency';
import {
  rowDisclosures,
  rowReceipts,
  hasWatch,
  type Disclosure,
} from '@/lib/leaderboard/disclosures';
import {
  BOARD_NETWORKS,
  boardNetworkFrom,
  escrowChainOf,
  NO_QUALIFYING_SETTLEMENTS,
  registryChainOf,
  type BoardAgent,
  type BoardNetwork,
} from '@/lib/leaderboard/network';
import {
  boardViewFrom,
  leaderboardCardHref,
  leaderboardHref,
  type BoardSelection,
  type BoardView,
} from '@/lib/leaderboard/href';
import {
  OUTCOME_METRICS,
  OUTCOME_METRIC_BY_ID,
  outcomeMetricFrom,
  outcomeMetricValue,
  rankOutcomeRows,
  type OutcomeMetricMeta,
  type OutcomeRow,
  type RankedOutcomeRow,
} from '@/lib/leaderboard/outcomes';
import { LEADERBOARD_METHOD_HREF } from '@/lib/leaderboard/method';
import { periodOf } from '@/lib/leaderboard/period';
import {
  ANSWER_RATE_SHORT,
  formatObservedSpan,
  MIN_RESPONSIVENESS_CHECKS,
  RESPONSIVENESS_WINDOW_DAYS,
  type CategoryResponsiveness,
  type ResponsivenessRow,
} from '@/lib/leaderboard/responsiveness';
import { loadOutcomeBoard, loadResponsivenessBoard } from '@/lib/leaderboard/server';
import { chainLabel } from '@/lib/network/presentation';
import { shareMetadata } from '@/lib/og/share';
import { cn } from '@/lib/ui/cn';
import { formatCount, formatPercent } from '@/lib/ui/format';
import { AgentAvatar } from '@/ui/Agent';
import { buttonClass } from '@/ui/Button';
import { SearchField } from '@/features/leaderboard/SearchField';
import { EmptyState, Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';

const TITLE = 'Who buyers actually paid';
const DESCRIPTION =
  'Two separate boards per network: settled escrow jobs with delivery evidence from external buyers, and the share of Pokter’s scheduled checks each agent answered. Sorted by one named metric at a time, with the receipt behind every figure.';

export const metadata: Metadata = {
  title: 'Leaderboard',
  description: DESCRIPTION,
  alternates: { canonical: '/leaderboard' },
  ...shareMetadata({ title: `${TITLE} · Pokter`, description: DESCRIPTION }),
};

/** The label a `Classification` shows, including the one that is not a category. */
function categoryLabel(category: Classification): string {
  return CATEGORY_BY_ID.get(category)?.label ?? 'Not categorised';
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

/** A trough of mutually exclusive links: the choice is a URL, so it is shareable. */
/**
 * A dropdown that is links, not a control.
 *
 * The board is a server component and a native `<select>` needs script to
 * navigate on change, so this is a `<details>` holding the same links the
 * chips held. It reads as the dropdown the design asks for and still works
 * with nothing running — which also keeps every narrowing of the board a
 * real URL somebody can share.
 */
function LinkMenu<T extends string>({
  label,
  value,
  options,
  href,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; count?: number }>;
  href: (value: T) => string;
}) {
  const current = options.find((option) => option.value === value) ?? options[0];
  return (
    <details className="group relative">
      <summary
        aria-label={label}
        className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-[10px] border border-rule bg-raised px-3 py-2 text-[13.5px] font-medium text-ink hover:border-rule-strong [&::-webkit-details-marker]:hidden"
      >
        {current?.label ?? label}
        <Icon.ChevronDown size={14} className="text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="absolute right-0 z-20 mt-1 max-h-72 min-w-[13rem] overflow-auto rounded-[10px] border border-rule bg-raised p-1 shadow-lg">
        {options.map((option) => (
          <li key={option.value}>
            <Link
              href={href(option.value)}
              scroll={false}
              aria-current={option.value === value ? 'true' : undefined}
              className={cn(
                'flex items-center justify-between gap-4 rounded-[7px] px-3 py-2 text-[13.5px] hover:bg-sunken',
                option.value === value ? 'font-medium text-ink' : 'text-ink-2',
              )}
            >
              {option.label}
              {option.count !== undefined && <span className="t-readout text-[12px] text-ink-3">{option.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ChipGroup<T extends string>({
  label,
  value,
  options,
  href,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; count?: number }>;
  href: (value: T) => string;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="t-label">{label}</legend>
      <div className="flex flex-wrap gap-1 rounded-[10px] bg-sunken p-1">
        {options.map((option) => (
          <Link
            key={option.value}
            href={href(option.value)}
            scroll={false}
            aria-current={value === option.value ? 'true' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 py-1.5 text-[12.5px] transition-colors',
              value === option.value ? 'bg-raised font-medium text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="t-readout text-[10.5px] text-ink-3">{formatCount(option.count)}</span>
            )}
          </Link>
        ))}
      </div>
    </fieldset>
  );
}



function Pagination({
  page,
  current,
  browse,
}: {
  page: Page<unknown>;
  current: BoardSelection;
  browse: BrowseQuery;
}) {
  if (page.pages <= 1) return null;
  const href = (n: number) => leaderboardHref(current, { ...browse, page: n });
  const step = (n: number, label: string, icon: ReactNode, disabled: boolean) =>
    disabled ? (
      <span aria-disabled className={cn(buttonClass('ghost', 's'), 'pointer-events-none opacity-40')}>
        {icon}
        {label}
      </span>
    ) : (
      <Link href={href(n)} scroll={false} rel={label === 'Previous' ? 'prev' : 'next'} className={buttonClass('secondary', 's')}>
        {icon}
        {label}
      </Link>
    );
  return (
    <nav aria-label="Board pages" className="flex flex-wrap items-center gap-1.5">
      {step(page.page - 1, 'Previous', <Icon.ChevronLeft size={13} />, page.page <= 1)}
      {pageLinks(page.page, page.pages).map((n, index) =>
        n === null ? (
          <span key={`gap-${index}`} aria-hidden className="px-1 text-[12px] text-ink-3">
            …
          </span>
        ) : (
          <Link
            key={n}
            href={href(n)}
            scroll={false}
            aria-current={n === page.page ? 'page' : undefined}
            className={cn(
              't-readout grid h-8 min-w-8 place-items-center rounded-[7px] px-2 text-[12.5px] transition-colors',
              n === page.page
                ? 'bg-signal text-signal-ink font-medium'
                : 'border border-rule text-ink-2 hover:border-ink hover:text-ink',
            )}
          >
            {n}
          </Link>
        ),
      )}
      {step(page.page + 1, 'Next', <Icon.ChevronRight size={13} />, page.page >= page.pages)}
    </nav>
  );
}


/** A job number that goes to the escrow receipt, which is the source of truth. */
function ReceiptLinks({ jobs, label }: { jobs: readonly HiredJob[]; label: string }) {
  if (jobs.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
      <span className="sr-only">{label}:</span>
      {jobs.map((job) => (
        <a
          key={`${job.chainId}:${job.jobId}`}
          href={jobReceipt(job, escrowCommerceAddress).href}
          target="_blank"
          rel="noreferrer"
          className="t-readout hover:underline"
        >
          #{job.jobId}
        </a>
      ))}
    </span>
  );
}

/**
 * A recorded time, or an em dash when there is none.
 *
 * It said "Never", which is a different and much larger claim than the one
 * the absence supports. With no job indexed on an escrow there is no refresh
 * time to report, and the tile read "Index last refreshed: Never" — which a
 * reader takes as Pokter never refreshing its index, rather than as this
 * network having nothing to refresh. The same word under "Last check
 * recorded" said Pokter had never checked an agent, when the figure is scoped
 * to a 30-day window and only says nothing was checked inside it.
 *
 * An em dash is what every other absent measurement on the site renders as
 * (`lib/ui/format`), and it makes no claim at all.
 */
function timestamp(value: string | null): string {
  if (!value) return '—';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '—';
  return new Date(parsed).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/* ------------------------------------------------------------------ *
 * Shared row parts
 * ------------------------------------------------------------------ */



/**
 * The outbound affordance, as its own column.
 *
 * It was two text links at the bottom of a five-line paragraph in the
 * identity cell, which is the last place a reader looks. Evidence is the
 * thing this board exists to hand over, so it gets a column and a glyph that
 * says the link goes somewhere.
 */
function EvidenceCell({ row, current }: { row: OutcomeRow; current: BoardSelection }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <Link
        href={`/proof?network=${current.network}&funder=outside-team&agent=${row.agent.key}`}
        className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink hover:underline"
      >
        Every job <Icon.ArrowUpRight size={12} className="text-ink-3" />
      </Link>
      <Link
        href={leaderboardCardHref({
          network: current.network,
          metric: current.metric,
          chainId: row.agent.chainId,
          tokenId: row.agent.tokenId,
        })}
        className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink hover:underline"
      >
        <Icon.Share size={11} /> Share card
      </Link>
    </span>
  );
}


/* ------------------------------------------------------------------ *
 * Customer outcomes
 * ------------------------------------------------------------------ */


/*
 * One grid for both boards.
 *
 * Outcomes used to be a 960px table for desktop and a separate card list
 * for phones: two renderings of one board, which is two places for a
 * column to go stale and one of them only visible at a width the author
 * was not looking at. It is now the same row treatment as responsiveness,
 * so a reader moving between the tabs is reading the same shape.
 */
const BOARD_GRID =
  'grid grid-cols-[1.75rem_minmax(0,1fr)_auto_1.25rem] items-center gap-x-3 gap-y-1 sm:grid-cols-[2rem_minmax(0,1fr)_7rem_7.5rem_1.75rem]';

/**
 * A read that failed, told apart from a board with nothing on it.
 *
 * These are different facts and the page must never let one wear the
 * other's clothes: an empty board says Pokter looked and found nothing,
 * and this says Pokter could not look. Showing a nought here would be the
 * worst available answer — it would assert the thing the read failed to
 * establish.
 *
 * Retry is a link to the same URL rather than a button, so it works
 * before hydration and on a page that is `force-dynamic` fetches the
 * board again.
 */
function BoardUnavailable({ reason, children, retryHref }: { reason: string; children: ReactNode; retryHref: string }) {
  return (
    <div className="py-14 text-center" role="status">
      <p className="text-[15px] font-medium text-ink">{reason}</p>
      <p className="mx-auto mt-2 max-w-xl text-[13px] leading-relaxed text-ink-2">{children}</p>
      <Link href={retryHref} prefetch={false} className={cn(buttonClass('secondary', 's'), 'mt-4')}>
        Retry
      </Link>
    </div>
  );
}

function OutcomeHeader({ active }: { active: OutcomeMetricMeta }) {
  return (
    <div className={cn(BOARD_GRID, 'hidden border-b border-rule pb-2 sm:grid')}>
      <span className="t-label">#</span>
      <span className="t-label">Agent</span>
      <span className="t-label flex items-center justify-end gap-1 whitespace-nowrap text-right text-ink">
        {active.short} <Icon.ChevronDown size={12} aria-hidden />
      </span>
      <span className="t-label whitespace-nowrap text-right">External buyers</span>
      <span className="sr-only">Details</span>
    </div>
  );
}

/**
 * One agent's outcomes, at one rank.
 *
 * The board carried five metric columns at once, each under a two-line
 * label, plus a disclosure strip between every pair of rows. Every figure
 * was on screen and none of them was legible. The metric being ordered by
 * leads; the rest are a press away, with the disclosures and the receipts
 * that back them — which is where evidence belongs on a list somebody is
 * scanning, not where it competes with the thing being scanned.
 *
 * Nothing is dropped and nothing is added together: `deliveredUnsettled`
 * and the courier figures keep their own lines inside, because a funded
 * job, a delivered job and a settled job are three different facts and
 * adding any two of them would claim money moved when it did not.
 */
function OutcomeLine({
  row,
  rank,
  current,
}: {
  row: OutcomeRow;
  rank: number | null;
  current: BoardSelection;
}) {
  const active = OUTCOME_METRIC_BY_ID.get(current.metric)!;
  const disclosures = rowDisclosures(row);
  const receipts = rowReceipts(row);
  return (
    <li>
      <details className="group">
        <summary
          className={cn(
            BOARD_GRID,
            'min-h-[56px] cursor-pointer list-none py-2.5 transition-colors hover:bg-sunken/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/40 sm:min-h-[60px] [&::-webkit-details-marker]:hidden',
          )}
        >
          <span className="t-readout text-[12.5px] tabular-nums text-ink-3">
            {rank === null ? '—' : String(rank).padStart(2, '0')}
          </span>
          <span className="flex min-w-0 items-center gap-2.5">
            <AgentAvatar name={row.agent.name} imageUrl={row.agent.imageUrl} seed={row.agent.key} size={30} />
            <span className="min-w-0">
              <Link
                href={`/agents/${row.agent.chainId}/${row.agent.tokenId}`}
                className="block truncate text-[14px] font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
              >
                {row.agent.name}
              </Link>
              {/* Registered where, because the registry chain and the escrow
                  the money settled on are different facts and can differ. */}
              <span className="block truncate text-[11.5px] text-ink-3">
                {row.listed ? `Registered on ${chainLabel(row.agent.chainId)}` : 'Not in Pokter’s current listing'}
              </span>
            </span>
          </span>
          <span className="t-readout col-start-3 row-start-1 text-right text-[14px] tabular-nums">
            {formatCount(outcomeMetricValue(row, current.metric))}
          </span>
          <span className="t-readout col-start-2 row-start-2 text-[12px] tabular-nums text-ink-3 sm:col-start-4 sm:row-start-1 sm:text-right">
            {formatCount(row.externalBuyers)} buyer{row.externalBuyers === 1 ? '' : 's'}
          </span>
          <Icon.ChevronRight
            size={14}
            aria-hidden
            className="col-start-4 row-start-1 justify-self-end text-ink-3 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none sm:col-start-5"
          />
        </summary>
        <div className="flex flex-col gap-3 px-1 pb-4 text-[12.5px] text-ink-2 sm:pl-[3.25rem]">
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            {OUTCOME_METRICS.map((metric) => (
              <div key={metric.id} className={cn(metric.id === active.id && 'text-ink')}>
                <dt className="t-label">{metric.short}</dt>
                <dd className="t-readout text-[14px] tabular-nums">
                  {formatCount(outcomeMetricValue(row, metric.id))}
                </dd>
              </div>
            ))}
            {/* Its own number and its own line: added to settled jobs it
                would claim money moved when the escrow still holds it. */}
            <div>
              <dt className="t-label">Delivered, not released</dt>
              <dd className="t-readout text-[14px] tabular-nums">{formatCount(row.deliveredUnsettled)}</dd>
            </div>
          </dl>
          {disclosures.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {disclosures.map((disclosure: Disclosure) => (
                <li key={disclosure.summary} className={cn(hasWatch([disclosure]) ? 'text-watch' : 'text-ink-2')}>
                  {disclosure.detail}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <EvidenceCell row={row} current={current} />
            {receipts.map((group) => (
              <ReceiptLinks key={group.label} jobs={group.jobs} label={group.label} />
            ))}
          </div>
        </div>
      </details>
    </li>
  );
}

const RESPONSIVENESS_GRID = BOARD_GRID;

/**
 * The column names, outside the list rather than as its first item.
 *
 * Not a row and not hidden from assistive tech: a header drawn as the first
 * `<li>` makes a list of eight agents announce nine items, and one marked
 * `aria-hidden` leaves a bare "99.7%" with nothing naming it. A sibling
 * `<div>` on the same explicit grid template lines up with the rows and is
 * read once, before them.
 */
function ResponsivenessHeader() {
  return (
    <div className={cn(RESPONSIVENESS_GRID, 'hidden border-b border-rule pb-2 sm:grid')}>
      <span className="t-label">#</span>
      <span className="t-label">Agent</span>
      <span className="t-label flex items-center justify-end gap-1 whitespace-nowrap text-right text-ink">
        Answer rate <Icon.ChevronDown size={12} aria-hidden />
      </span>
      <span className="t-label whitespace-nowrap text-right">Checks answered</span>
      <span className="sr-only">Details</span>
    </div>
  );
}

/**
 * One agent, at one rank.
 *
 * The span and the declared protocol used to print on every row, which is
 * two extra lines of small text per agent for facts most readers never
 * need and nobody needs on all twelve at once. They are a disclosure, not
 * a decoration, so they are one press away rather than gone — a `details`
 * rather than a tooltip, because a tooltip is a thing phones do not have.
 *
 * The row is the summary, so the whole row is the target: on a phone that
 * is a 56px press rather than a chevron, and on a keyboard it is one tab
 * stop that opens with Enter.
 */
function ResponsivenessLine({ row, rank }: { row: ResponsivenessRow; rank: number | null }) {
  const span = row.checks > 0 ? formatObservedSpan(row.observedDays) : null;
  return (
    <li>
      <details className="group">
        <summary
          className={cn(
            RESPONSIVENESS_GRID,
            'min-h-[56px] cursor-pointer list-none py-2.5 transition-colors hover:bg-sunken/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal/40 sm:min-h-[60px] [&::-webkit-details-marker]:hidden',
          )}
        >
          <span className="t-readout text-[12.5px] tabular-nums text-ink-3">
            {rank === null ? '—' : String(rank).padStart(2, '0')}
          </span>
          <span className="flex min-w-0 items-center gap-2.5">
            <AgentAvatar name={row.agent.name} imageUrl={row.agent.imageUrl} seed={row.agent.key} size={30} />
            <Link
              href={`/agents/${row.agent.chainId}/${row.agent.tokenId}`}
              className="truncate text-[14px] font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
            >
              {row.agent.name}
            </Link>
          </span>
          {/*
            One decimal, because nought rounded 349 of 350 up to "100%".
            That was the top row of the production board: a check had
            failed and the headline figure said none had. Display only —
            the ordering and the tie-break read the unrounded rate.
          */}
          <span className="t-readout col-start-3 row-start-1 text-right text-[14px] tabular-nums">
            {row.ranked ? formatPercent(row.answerRate, { decimals: 1 }) : '—'}
          </span>
          {/*
            "0 of 0 checks" read as an agent that answered nothing, when
            the fact is that Pokter asked nothing of it inside the window.
          */}
          <span className="t-readout col-start-2 row-start-2 text-[12px] tabular-nums text-ink-3 sm:col-start-4 sm:row-start-1 sm:text-right">
            {row.checks === 0
              ? 'No check in this window'
              : `${formatCount(row.answered)} of ${formatCount(row.checks)}`}
          </span>
          <Icon.ChevronRight
            size={14}
            aria-hidden
            className="col-start-4 row-start-1 justify-self-end text-ink-3 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none sm:col-start-5"
          />
        </summary>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 pb-3 text-[12.5px] text-ink-2 sm:pl-[3.25rem]">
          {span && <span className="t-readout">Observed {span}</span>}
          <span>Declared protocol: {row.protocol ?? 'none declared'}</span>
          <Link
            href={`/agents/${row.agent.chainId}/${row.agent.tokenId}#history`}
            className="inline-flex items-center gap-1 font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            Check history <Icon.ArrowUpRight size={12} className="text-ink-3" />
          </Link>
        </div>
      </details>
    </li>
  );
}

function ResponsivenessCategory({
  entry,
  browse,
}: {
  entry: CategoryResponsiveness;
  browse: BrowseQuery;
}) {
  const category = CATEGORY_BY_ID.get(entry.category)!;
  /*
   * Ranked first, then narrowed, so a row keeps the standing it holds in its
   * category rather than the position it happens to occupy among the rows a
   * search left behind.
   */
  const ranked = entry.ranked
    .map((row, index) => ({ row, rank: index + 1 }))
    .filter(({ row }) => matchesBrowse(row.agent, browse));
  const below = entry.belowMinimum.filter((row) => matchesBrowse(row.agent, browse));
  if (ranked.length === 0 && below.length === 0) return null;
  const hiddenByBrowse =
    entry.ranked.length - ranked.length + (entry.belowMinimum.length - below.length);
  return (
    <section aria-labelledby={`responsiveness-${entry.category}`} className="pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-3">
        {/*
          The category is the title. It used to be a label above a heading
          that was really a sentence about the eligibility rule — so every
          section shouted the rule and whispered which category it was
          about. The rule is on the methodology page; the count is what a
          reader wants beside the name.
        */}
        <div className="flex items-baseline gap-2.5">
          <h3 id={`responsiveness-${entry.category}`} className="text-[16px] font-semibold tracking-[-0.01em]">
            {category.label}
          </h3>
          <span className="text-[13px] text-ink-3">
            {formatCount(entry.ranked.length)} agent{entry.ranked.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
      {/*
        Said where the rows are missing from, not only at the top of the page.
        A category heading that counts eight agents above a list of two is the
        same defect as a stale column label: the figure is right about the
        board and wrong about what is under it.
      */}
      {hiddenByBrowse > 0 && (
        <p className="pt-3 text-[12.5px] text-ink-3">
          {formatCount(hiddenByBrowse)} agent{hiddenByBrowse === 1 ? '' : 's'} in this category
          {hiddenByBrowse === 1 ? ' is' : ' are'} hidden by the search above.
        </p>
      )}
      {entry.ranked.length === 0 ? (
        <p className="border-b border-rule bg-sunken/50 px-4 py-3 text-[13px] text-ink-2">
          No agent in this category has {MIN_RESPONSIVENESS_CHECKS} checks in the last {RESPONSIVENESS_WINDOW_DAYS}{' '}
          days, so Pokter publishes no order for it. Every listed agent in this category is below, with whatever
          checks Pokter has for it — which for some is none.
        </p>
      ) : (
        ranked.length > 0 && (
          <>
            <ResponsivenessHeader />
            <ol className="divide-y divide-rule">
              {ranked.map(({ row, rank }) => (
                <ResponsivenessLine key={row.agent.key} row={row} rank={rank} />
              ))}
            </ol>
          </>
        )
      )}
      {below.length > 0 && (
        <details className="mt-3 rounded-[12px] border border-rule bg-sunken/40 px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-medium">
            {formatCount(below.length)} agent{below.length === 1 ? '' : 's'} with too few checks to rank
          </summary>
          <p className="mt-2 text-[12.5px] text-ink-2">
            Listed with their figures and left unordered. A rate out of a handful of attempts is not a low rate, it is
            no measurement.
          </p>
          <ol className="mt-2 divide-y divide-rule">
            {below.map((row) => (
              <ResponsivenessLine key={row.agent.key} row={row} rank={null} />
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const network = boardNetworkFrom(raw.network);
  const view = boardViewFrom(raw.view);
  const metric = outcomeMetricFrom(raw.metric);
  const current: BoardSelection = { network, view, metric };
  const browse = browseQueryFrom(raw);

  const [outcomes, responsiveness] = await Promise.all([
    view === 'outcomes' ? loadOutcomeBoard(network, metric) : Promise.resolve(null),
    view === 'responsiveness' ? loadResponsivenessBoard(network) : Promise.resolve(null),
  ]);


  /* Every agent the board holds, before any narrowing, so the category chips
     show the board's own distribution rather than the filtered one — a chip
     whose count changes when you press it is a count of nothing. */
  const boardAgents: BoardAgent[] =
    outcomes?.state === 'ready'
      ? outcomes.data.rows.map((row) => row.agent)
      : responsiveness?.state === 'ready'
        ? responsiveness.data.categories.flatMap((entry) =>
            [...entry.ranked, ...entry.belowMinimum].map((row) => row.agent),
          )
        : [];
  /* What the board read, from whichever board is showing. Null when the
     read failed, so the header says nothing rather than nought. */
  const agentsRead: number | null =
    outcomes?.state === 'ready'
      ? outcomes.data.coverage.listedAgents
      : responsiveness?.state === 'ready'
        ? responsiveness.data.coverage.listedAgents
        : null;

  /*
   * The meta line: the window the figures were taken in, the sample an
   * agent needs before it is ranked, and how much was read. Short because
   * it is read every time, and the three facts it carries are the ones a
   * figure here is misleading without.
   */
  const lastRead =
    outcomes?.state === 'ready'
      ? outcomes.data.coverage.lastRefreshedAt
      : responsiveness?.state === 'ready'
        ? responsiveness.data.coverage.lastCheckedAt
        : null;
  const boardMeta = [
    periodOf(view).value,
    view === 'responsiveness' ? `At least ${MIN_RESPONSIVENESS_CHECKS} checks` : null,
    /* The sample the outcomes figures came out of. A count of nought
       qualifying means something only beside the number of jobs it was
       drawn from, and that pair is the board's whole coverage claim. */
    view === 'outcomes' && outcomes?.state === 'ready'
      ? `${formatCount(outcomes.data.coverage.indexedJobs)} indexed, ${formatCount(outcomes.data.coverage.qualifyingJobs)} qualifying`
      : null,
    agentsRead !== null ? `${formatCount(agentsRead)} agents read` : null,
    /* Freshness stays on the board. A board with no time on it reads as
       current whatever its age, and this one is refreshed by a sweep. */
    lastRead ? `updated ${timestamp(lastRead)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const counts = categoryCounts(boardAgents);
  const categoryOptions = [
    { value: ALL_CATEGORIES as Classification | typeof ALL_CATEGORIES, label: 'All', count: boardAgents.length },
    ...[...counts.entries()]
      .sort((a, b) => b[1] - a[1] || categoryLabel(a[0]).localeCompare(categoryLabel(b[0])))
      .map(([category, count]) => ({
        value: category as Classification | typeof ALL_CATEGORIES,
        label: categoryLabel(category),
        count,
      })),
  ];

  const ranked =
    outcomes?.state === 'ready' ? rankOutcomeRows(outcomes.data.rows, metric) : ([] as RankedOutcomeRow[]);
  const outcomePage = pageOf(ranked, ({ row }) => matchesBrowse(row.agent, browse), browse);
  const outcomeSummary = browseSummary(outcomePage, browse);

  return (
    /*
      One centred column, not the full page frame. The board is a list and
      a list has a comfortable reading width; stretched to the frame the
      rank sat a screen away from the figure it ranked. Top padding is
      small because the page already has a banner and a nav above it, and
      a reader arriving at a leaderboard has arrived to read rows.
    */
    <div className="mx-auto w-full max-w-[1060px] px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] sm:text-[34px]">Leaderboard</h1>
        <p className="text-[14px] text-ink-2 sm:text-[15px]">Compare agents by observed results.</p>
      </header>

      {/* The two boards, on their own row, as the first choice a reader makes. */}
      <nav aria-label="What is measured" className="mt-5 border-b border-rule">
        <ul className="flex gap-5">
          {(
            [
              { id: 'outcomes', label: 'Customer outcomes' },
              { id: 'responsiveness', label: 'Responsiveness' },
            ] as ReadonlyArray<{ id: BoardView; label: string }>
          ).map((tab) => (
            <li key={tab.id}>
              <Link
                href={leaderboardHref({ ...current, view: tab.id }, { ...browse, page: 1 })}
                scroll={false}
                aria-current={tab.id === view ? 'page' : undefined}
                className={cn(
                  'relative -mb-px flex h-10 items-center border-b-2 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40',
                  tab.id === view ? 'border-signal text-ink' : 'border-transparent text-ink-3 hover:text-ink',
                )}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/*
        One toolbar, one height. Network, category and search were a
        dropdown row, a label and a submit button at three different
        baselines; on a phone they took a third of the screen before any
        data. They wrap here rather than scroll, and search takes its own
        row at the width where sharing one would squeeze both.
      */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <LinkMenu<BoardNetwork>
          label="Network"
          value={network}
          options={BOARD_NETWORKS.map((value) => ({ value, label: chainLabel(escrowChainOf(value)) }))}
          href={(value) => leaderboardHref({ ...current, network: value }, { ...browse, page: 1 })}
        />
        {categoryOptions.length > 1 && (
          <LinkMenu<Classification | typeof ALL_CATEGORIES>
            label="Category"
            value={browse.category}
            options={categoryOptions}
            href={(value) => leaderboardHref(current, { search: browse.search, category: value, page: 1 })}
          />
        )}
        <div className="w-full sm:ml-auto sm:w-auto">
          <SearchField />
        </div>
      </div>

      {/*
        The window the figures were taken in and how fresh they are, said
        once and quietly. These are facts about the data, not headings:
        printed large they competed with the rows, and a reader scanning a
        leaderboard does not need a counter in bold.
      */}
      <p className="mt-3 border-b border-rule pb-3 text-[12px] text-ink-3">{boardMeta}</p>

      {view === 'outcomes' && outcomes && (
        <section aria-labelledby="outcomes-title">
          {/*
            Title, then the one line that explains the order, then the
            table. The definition of the metric, the split and the period
            are kept — under the table, in `How these figures are counted`,
            because a reader who wants the rule wants it beside the figure
            it produced and a reader who wants the figure should not have
            to read the rule first.
          */}

          {outcomes.state === 'unavailable' ? (
            <BoardUnavailable reason={outcomes.reason} retryHref={leaderboardHref(current, browse)}>
              Pokter could not read the job index or the registry for this board, so it is showing nothing rather than
              a zero. An empty board would claim no buyer has settled a job here, which this read does not establish.
            </BoardUnavailable>
          ) : (
            <>

              {/*
                Gated on the qualifying count, not on whether there are rows.
                A row exists for a job that was delivered and not settled, or
                that Pokter's courier settled, so a network with no qualifying
                settlement at all could still render a table ordered by
                "Settled jobs with delivery evidence" — every figure in that
                column a nought, a dash for a rank, and the sentence that is
                supposed to appear nowhere on the page.

                Mainnet escapes it today only because every job indexed there
                is team-funded. The first outside-funded mainnet hire that is
                delivered and not yet released would suppress the sentence,
                and that hire is the thing this marketplace is working
                toward.
              */}
              {outcomes.data.coverage.qualifyingJobs === 0 ? (
                /*
                  Calm, and finished rather than broken.

                  This was a dashed box around a paragraph of counters,
                  which is a technical report standing where the list
                  should be. The short sentence is what a reader needs;
                  the counters are what a sceptic needs, and they are one
                  press away rather than gone.

                  `NO_QUALIFYING_SETTLEMENTS` is the exact sentence this
                  board agreed to publish for a query that ran and matched
                  nothing, and it is still published — first, inside the
                  disclosure, where it keeps its job of saying this is a
                  statement about Pokter's index rather than about the
                  chain. The headline above it says the same thing in the
                  words the design asks for.
                */
                <div className="py-14 text-center">
                  <p className="text-[15px] font-medium text-ink">
                    No qualifying customer settlements in this view yet.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    {network === 'mainnet' && (
                      <Link
                        href={leaderboardHref({ ...current, network: 'testnet' }, { ...browse, page: 1 })}
                        className={cn(buttonClass('secondary', 's'))}
                      >
                        View testnet
                      </Link>
                    )}
                    <Link
                      href={leaderboardHref({ ...current, view: 'responsiveness' }, { ...browse, page: 1 })}
                      className={cn(buttonClass(network === 'mainnet' ? 'ghost' : 'secondary', 's'))}
                    >
                      View responsiveness
                    </Link>
                  </div>
                  <details className="group mx-auto mt-6 max-w-xl text-left">
                    <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 [&::-webkit-details-marker]:hidden">
                      <Icon.ChevronRight
                        size={13}
                        aria-hidden
                        className="transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
                      />
                      Why no results?
                    </summary>
                    <div className="mt-3 rounded-[10px] bg-sunken px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
                      <p>{NO_QUALIFYING_SETTLEMENTS}</p>
                      <p className="mt-2">
                        Of the {formatCount(outcomes.data.coverage.indexedJobs)} jobs indexed on this escrow,{' '}
                        {formatCount(outcomes.data.coverage.exclusions.teamFunded)} were funded by Pokter&rsquo;s own
                        declared wallets, {formatCount(outcomes.data.coverage.exclusions.selfHire)} were an operator
                        paying their own agent, {formatCount(outcomes.data.coverage.exclusions.lifecycleDemo)} were
                        lifecycle demonstrations, and{' '}
                        {formatCount(outcomes.data.coverage.exclusions.unattributed)} name no ERC-8004 identity Pokter
                        can attribute them to.
                      </p>
                      <p className="mt-2">
                        This is a statement about Pokter&rsquo;s index on this network, not about the chain. The index
                        holds a job only where the hire was recorded as well as funded.
                      </p>
                      <Link
                        href={LEADERBOARD_METHOD_HREF}
                        className="mt-2 inline-block font-medium text-ink hover:underline"
                      >
                        What counts, and what is excluded
                      </Link>
                    </div>
                  </details>
                </div>
              ) : outcomePage.matched === 0 ? (
                /*
                  A search that matched nothing is not an empty board, and it
                  must not borrow the sentence that is one. The board behind
                  it still holds rows and says how many.
                */
                <EmptyState title="Nothing on this board matches these filters" className="mt-6">
                  {outcomeSummary} Clearing them shows the {formatCount(outcomePage.total)} agent
                  {outcomePage.total === 1 ? '' : 's'} this board holds. This says nothing about the network: the
                  sentence for a board with no qualifying settlement is a different one, and it is not this.
                </EmptyState>
              ) : (
                <>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[12.5px] text-ink-2">{outcomeSummary}</p>
                    <Pagination page={outcomePage} current={current} browse={browse} />
                  </div>
                  {/*
                    At phone width the rows are cards and there are no column
                    headers to press, so the one control that changes the
                    order has to exist somewhere else. Only below `md`: two
                    controls for one choice is two places for them to
                    disagree about which column produced the order.
                  */}
                  <div className="mt-4 md:hidden">
                    <ChipGroup
                      label="Ordered by"
                      value={metric}
                      options={OUTCOME_METRICS.map((entry) => ({ value: entry.id, label: entry.short }))}
                      href={(value) => leaderboardHref({ ...current, metric: value }, { ...browse, page: 1 })}
                    />
                  </div>
                  <div className="mt-3">
                    <OutcomeHeader active={OUTCOME_METRIC_BY_ID.get(metric)!} />
                    <ol className="divide-y divide-rule">
                      {outcomePage.rows.map(({ row, rank }) => (
                        <OutcomeLine key={row.agent.key} row={row} rank={rank} current={current} />
                      ))}
                    </ol>
                  </div>
                  {outcomePage.pages > 1 && (
                    <div className="mt-4 flex justify-end">
                      <Pagination page={outcomePage} current={current} browse={browse} />
                    </div>
                  )}
                </>
              )}

            </>
          )}
        </section>
      )}

      {view === 'responsiveness' && responsiveness && (
        <section aria-labelledby="responsiveness-title">

          {responsiveness.state === 'unavailable' ? (
            <BoardUnavailable reason={responsiveness.reason} retryHref={leaderboardHref(current, browse)}>
              Pokter could not read the registry for this network, so it is showing nothing rather than a zero. An
              empty board would claim no agent answers, which this read does not establish.
            </BoardUnavailable>
          ) : (
            <>

              {/*
                Stated here, above the order it qualifies, rather than behind
                the methodology link. The column says "last 30 days" and the
                automatic reading is that every row was measured over those
                30 days; on this data they were not, and the misreading is the
                flattering one, which is the same reason
                `ANSWER_RATE_DOES_NOT_MEAN` is printed in the header instead
                of linked. The figures come from the board being rendered, so
                this cannot go stale the way the fixed claim it replaces did.
              */}

              {responsiveness.data.coverage.unreadCategories.length > 0 && (
                <Notice tone="watch" className="mt-4" title="Some categories could not be read">
                  The registry answered no read for{' '}
                  {responsiveness.data.coverage.unreadCategories
                    .map((category) => CATEGORY_BY_ID.get(category)?.label ?? category)
                    .join(', ')}
                  . Those agents are missing from this board rather than absent from the marketplace.
                </Notice>
              )}

              {responsiveness.data.categories.every(
                (entry) => entry.ranked.length === 0 && entry.belowMinimum.length === 0,
              ) ? (
                <EmptyState title="No checks recorded for this network and period" className="mt-6">
                  The query ran and matched nothing: Pokter holds no check in the last {RESPONSIVENESS_WINDOW_DAYS}{' '}
                  days for any listed agent on {chainLabel(registryChainOf(network))}.
                </EmptyState>
              ) : (
                <div className="flex flex-col divide-y divide-rule">
                  {responsiveness.data.categories.map((entry) => (
                    <ResponsivenessCategory key={entry.category} entry={entry} browse={browse} />
                  ))}
                </div>
              )}

            </>
          )}
        </section>
      )}

      {/*
        The one sentence that has to be under the figure it qualifies.
        Everything else moved to the methodology page; this did not,
        because the automatic reading of a response rate is that it
        measures the answers, and a reader who takes the column at face
        value has already been misled by the time they click a link.
      */}
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4 text-[12.5px] text-ink-3">
        <p>
          {view === 'responsiveness' ? ANSWER_RATE_SHORT : 'Settled jobs, not a measure of whether the answer was useful.'}
        </p>
        <Link
          href={LEADERBOARD_METHOD_HREF}
          className="font-medium text-ink-2 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
        >
          How rankings work
        </Link>
      </footer>

    </div>
  );
}
