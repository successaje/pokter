import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { CATEGORY_BY_ID, type Classification } from '@/lib/agents/categories';
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
  summaryOf,
  rowReceipts,
  hasWatch,
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
  sortResponsivenessRows,
  type ResponsivenessBoard,
  type ResponsivenessRow,
} from '@/lib/leaderboard/responsiveness';
import { loadOutcomeBoard, loadResponsivenessBoard, loadScoreBoard, type ScoreRow } from '@/lib/leaderboard/server';
import { chainLabel } from '@/lib/network/presentation';
import { shareMetadata } from '@/lib/og/share';
import { cn } from '@/lib/ui/cn';
import { formatCount, formatPercent } from '@/lib/ui/format';
import { AgentAvatar } from '@/ui/Agent';
import { buttonClass } from '@/ui/Button';
import { DismissMenus } from '@/features/leaderboard/DismissMenus';
import { SearchField } from '@/features/leaderboard/SearchField';
import { MIN_CHECKS, UNRANKED_COPY, type EvidenceStrength } from '@/lib/score/track-record';
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
    <details data-menu className="group relative">
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



/**
 * BNB Chain or BNB Testnet: one choice, always visible, at the board's top
 * corner. A dropdown hid which money the board was counting behind a press;
 * a two-way toggle says it at a glance and switches in one.
 */
function NetworkToggle({ value, href }: { value: BoardNetwork; href: (network: BoardNetwork) => string }) {
  return (
    <nav aria-label="Network" className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-rule bg-sunken p-1">
      {BOARD_NETWORKS.map((network) => (
        <Link
          key={network}
          href={href(network)}
          scroll={false}
          aria-current={network === value ? 'page' : undefined}
          className={cn(
            'whitespace-nowrap rounded-full px-2 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 sm:px-3.5 sm:text-[13px]',
            network === value ? 'bg-raised text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
          )}
        >
          {/* Shorter on a phone, so the toggle stays on the title's line. */}
          <span className="sm:hidden">{network === 'testnet' ? 'Testnet' : 'Mainnet'}</span>
          <span className="hidden sm:inline">{chainLabel(escrowChainOf(network))}</span>
        </Link>
      ))}
    </nav>
  );
}

interface PodiumEntry {
  agent: BoardAgent;
  rank: number;
  value: string;
  label: string;
  /** What the agent does, in the merged view, so first place is not read as best at everything. */
  sub: string | null;
}

const PODIUM_COLUMN: Record<number, string> = { 1: 'col-start-2', 2: 'col-start-1', 3: 'col-start-3' };
const PODIUM_STEP: Record<number, string> = { 1: 'h-14', 2: 'h-10', 3: 'h-7' };

/**
 * The first three, raised above the list.
 *
 * Only on the first page of a board nobody has searched, where "the top
 * three" is a fact about the board; under a search it would crown whoever
 * happened to match. Read first, second, third; drawn second, first, third,
 * the way a podium stands. The list below starts at fourth, so no agent
 * appears twice.
 */
function Podium({ entries }: { entries: PodiumEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <ol aria-label="Top three" className="mb-8 grid grid-cols-3 items-end gap-2 sm:gap-4">
      {entries.slice(0, 3).map((entry) => (
        <li key={entry.agent.key} className={cn('row-start-1 flex min-w-0 flex-col', PODIUM_COLUMN[entry.rank])}>
          <Link
            href={`/agents/${entry.agent.chainId}/${entry.agent.tokenId}`}
            className={cn(
              'group flex flex-col items-center gap-1.5 rounded-t-[14px] border border-b-0 px-2 pb-3 pt-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 sm:px-4',
              entry.rank === 1 ? 'border-signal/40 bg-signal-wash' : 'border-rule bg-raised hover:bg-sunken/50',
            )}
          >
            <AgentAvatar name={entry.agent.name} imageUrl={entry.agent.imageUrl} seed={entry.agent.key} size={entry.rank === 1 ? 52 : 44} />
            <span className="w-full truncate text-[13px] font-semibold leading-tight group-hover:underline sm:text-[15px]">
              {entry.agent.name}
            </span>
            {entry.sub && <span className="w-full truncate text-[11px] text-ink-3 sm:text-[12px]">{entry.sub}</span>}
            <span className="t-readout mt-1 text-[18px] font-medium tabular-nums sm:text-[22px]">{entry.value}</span>
            <span className="text-[11px] text-ink-3 sm:text-[12px]">{entry.label}</span>
          </Link>
          <span
            aria-hidden
            className={cn(
              't-readout grid place-items-center rounded-b-[14px] border text-[15px] font-semibold',
              PODIUM_STEP[entry.rank],
              entry.rank === 1 ? 'border-signal bg-signal text-signal-ink' : 'border-rule bg-sunken text-ink-2',
            )}
          >
            {entry.rank}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The podium's three, when this view should have one: page one, no search, ranked rows only. */
function podiumOf<T>(rows: ReadonlyArray<{ row: T; rank: number | null }>, browse: BrowseQuery, page: number): Array<{ row: T; rank: number }> {
  if (page !== 1 || browse.search.trim()) return [];
  return rows.filter((entry): entry is { row: T; rank: number } => entry.rank !== null && entry.rank <= 3).slice(0, 3);
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
  /* One line: the receipts by name, the share card as an icon. Stacked, the two links set the row's height. */
  return (
    <span className="flex items-center justify-end gap-1">
      <Link
        href={`/proof?network=${current.network}&funder=outside-team&agent=${row.agent.key}`}
        className="inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] font-medium text-ink hover:underline"
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
        aria-label={`Share ${row.agent.name}’s card`}
        title="Share card"
        className="grid size-8 shrink-0 place-items-center rounded-[8px] text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
      >
        <Icon.Share size={14} aria-hidden />
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
  'grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[2.5rem_minmax(0,1fr)_6.5rem_6.5rem_7.5rem]';

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

/**
 * The Pokter Score table.
 *
 * Flat, by design. The two other boards grew an expandable row each, which
 * is a place to put detail that then has to be opened one row at a time —
 * and the detail a reader wants after seeing a score is the breakdown,
 * which belongs on the agent's own page beside everything else about it.
 * So the name is the link and the row carries only what ranks it.
 */
const SCORE_GRID =
  'grid grid-cols-[1.5rem_minmax(0,1fr)_auto_1rem] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_9rem_7.5rem]';

const STRENGTH_LABEL: Record<EvidenceStrength, string> = {
  limited: 'Limited',
  moderate: 'Moderate',
  strong: 'Strong',
};

function ScoreTable({ rows, merged }: { rows: ReadonlyArray<{ row: ScoreRow; rank: number }>; merged: boolean }) {
  return (
    <>
      <div className={cn(SCORE_GRID, 'hidden border-b border-rule px-3 pb-2.5 sm:grid')}>
        <span className="t-label">#</span>
        <span className="t-label">Agent</span>
        <span className="t-label flex items-center justify-end gap-1 whitespace-nowrap text-right text-ink">
          Score <Icon.ChevronDown size={12} aria-hidden />
        </span>
        <span className="t-label whitespace-nowrap text-right">Evidence strength</span>
        <span className="t-label whitespace-nowrap text-right">Jobs completed</span>
      </div>
      <ol className="divide-y divide-rule">
        {rows.map(({ row, rank }) => (
          <li
            key={row.agent.key}
            className={cn(
              SCORE_GRID,
              'min-h-[72px] px-3 py-3 transition-colors sm:min-h-[84px] sm:py-4',
              /* The leader, and only the leader. A restrained wash is the
                 one piece of emphasis on the page; applied to more than a
                 single row it stops being emphasis and becomes stripes. */
              rank === 1 ? 'bg-signal-wash' : 'hover:bg-sunken/50',
            )}
          >
            <span className="t-readout text-[13px] tabular-nums text-ink-3">
              {String(rank).padStart(2, '0')}
            </span>
            <span className="flex min-w-0 items-center gap-2.5">
              <AgentAvatar name={row.agent.name} imageUrl={row.agent.imageUrl} seed={row.agent.key} size={38} />
              <span className="min-w-0">
                <Link
                  href={`/agents/${row.agent.chainId}/${row.agent.tokenId}`}
                  className="block truncate text-[15.5px] font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
                >
                  {row.agent.name}
                </Link>
                {/* In the merged list, what the agent does, so a score is read
                    beside its category; inside one category, where it is
                    registered. */}
                <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                  {merged ? categoryLabel(row.agent.category) : chainLabel(row.agent.chainId)}
                </span>
              </span>
            </span>
            <span className="t-readout col-start-3 row-start-1 text-right text-[17px] font-medium tabular-nums">
              {Math.round(row.score.overall ?? 0)}
            </span>
            <span className="col-start-2 row-start-2 text-[13px] text-ink-3 sm:col-start-4 sm:row-start-1 sm:text-right">
              {STRENGTH_LABEL[row.score.evidence]}
            </span>
            {/*
              Completed means the escrow released and this agent submitted
              the delivery itself. A job Pokter's courier carried is not
              counted, and nor is a self-hire.
            */}
            <span className="t-readout col-start-3 row-start-2 text-[13px] tabular-nums text-ink-3 sm:col-start-5 sm:row-start-1 sm:text-right">
              {formatCount(row.score.delivered)} of {formatCount(row.score.resolvedJobs)}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

function OutcomeHeader({ active }: { active: OutcomeMetricMeta }) {
  return (
    <div className={cn(BOARD_GRID, 'hidden border-b border-rule px-3 pb-2.5 sm:grid')}>
      <span className="t-label">#</span>
      <span className="t-label">Agent</span>
      <span className="t-label flex items-center justify-end gap-1 whitespace-nowrap text-right text-ink">
        {active.short} <Icon.ChevronDown size={12} aria-hidden />
      </span>
      <span className="t-label whitespace-nowrap text-right">External buyers</span>
      <span className="t-label whitespace-nowrap text-right">Evidence</span>
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
  return (
    /*
      Flat, like the other two. The metrics, the disclosures and the
      receipts were in an expansion; they are on the agent's own page,
      which is where a reader who wants the evidence behind a figure is
      going anyway, and the board links to it by name.
    */
    <li
      className={cn(
        BOARD_GRID,
        'min-h-[72px] px-3 py-3 transition-colors sm:min-h-[84px] sm:py-4',
        rank === 1 ? 'bg-signal-wash' : 'hover:bg-sunken/50',
      )}
    >
      <span className="t-readout text-[13px] tabular-nums text-ink-3">
        {rank === null ? '—' : String(rank).padStart(2, '0')}
      </span>
      <span className="flex min-w-0 items-center gap-2.5">
        <AgentAvatar name={row.agent.name} imageUrl={row.agent.imageUrl} seed={row.agent.key} size={38} />
        <span className="min-w-0">
          <Link
            href={`/agents/${row.agent.chainId}/${row.agent.tokenId}`}
            className="block truncate text-[15.5px] font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            {row.agent.name}
          </Link>
          {/*
            The disclosure that weakens the figures stays on the row.
            It was inside an expansion; expansions are gone, and the agent
            page does not carry these, so removing them would have deleted
            a disclosure rather than moved one. One line, no toggle: a
            reader who never opens anything still learns that the buyer
            owns the agent, or wrote its review.
          */}
          <span
            className={cn(
              'mt-0.5 block truncate text-[13px]',
              hasWatch(rowDisclosures(row)) ? 'text-watch' : 'text-ink-3',
            )}
          >
            {summaryOf(rowDisclosures(row), rowReceipts(row)) ??
              (row.listed ? chainLabel(row.agent.chainId) : 'Not in Pokter’s current listing')}
          </span>
        </span>
      </span>
      <span className="t-readout col-start-3 row-start-1 text-right text-[15px] font-medium tabular-nums">
        {formatCount(outcomeMetricValue(row, current.metric))}
      </span>
      <span className="t-readout col-start-2 row-start-2 text-[13px] tabular-nums text-ink-3 sm:col-start-4 sm:row-start-1 sm:text-right">
        {formatCount(row.externalBuyers)} buyer{row.externalBuyers === 1 ? '' : 's'}
      </span>
      <span className="col-start-3 row-start-2 justify-self-end sm:col-start-5 sm:row-start-1">
        <EvidenceCell row={row} current={current} />
      </span>
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
    <div className={cn(RESPONSIVENESS_GRID, 'hidden border-b border-rule px-3 pb-2.5 sm:grid')}>
      <span className="t-label">#</span>
      <span className="t-label">Agent</span>
      <span className="t-label flex items-center justify-end gap-1 whitespace-nowrap text-right text-ink">
        Answer rate <Icon.ChevronDown size={12} aria-hidden />
      </span>
      <span className="t-label whitespace-nowrap text-right">Checks answered</span>
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
function ResponsivenessLine({ row, rank, sub }: { row: ResponsivenessRow; rank: number | null; sub?: string | null }) {
  return (
    /*
      Flat. This was an expandable row holding the observed span and the
      declared protocol; the span now rides under the denominator it
      qualifies, where it is one glance rather than one press, and the
      protocol lives on the agent's page with the rest of what it declares.
    */
    <li
      className={cn(
        RESPONSIVENESS_GRID,
        'min-h-[72px] px-3 py-3 transition-colors sm:min-h-[84px] sm:py-4',
        /* The leader of this category, and nothing else. Unranked rows
           never take it: the wash says "top of this order" and a row with
           no rank is not in the order. */
        rank === 1 ? 'bg-signal-wash' : 'hover:bg-sunken/50',
      )}
    >
      <span className="t-readout text-[13px] tabular-nums text-ink-3">
        {rank === null ? '—' : String(rank).padStart(2, '0')}
      </span>
      <span className="flex min-w-0 items-center gap-2.5">
        <AgentAvatar name={row.agent.name} imageUrl={row.agent.imageUrl} seed={row.agent.key} size={38} />
        <span className="min-w-0">
          <Link
            href={`/agents/${row.agent.chainId}/${row.agent.tokenId}`}
            className="block truncate text-[15.5px] font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
          >
            {row.agent.name}
          </Link>
          {sub && <span className="mt-0.5 block truncate text-[13px] text-ink-3">{sub}</span>}
        </span>
      </span>
      {/*
        One decimal, because nought rounded 349 of 350 up to "100%". That
        was the top row of the production board: a check had failed and the
        headline figure said none had. Display only — the ordering and the
        tie-break read the unrounded rate.
      */}
      <span className="t-readout col-start-3 row-start-1 text-right text-[15px] font-medium tabular-nums">
        {row.ranked ? formatPercent(row.answerRate, { decimals: 1 }) : '—'}
      </span>
      {/*
        "0 of 0 checks" read as an agent that answered nothing, when the
        fact is that Pokter asked nothing of it inside the window.
      */}
      {/*
        Two short lines, neither of which wraps. "384 of 386 / over 22.4 of
        30 days" wrapped to three ragged lines in a 9rem column and the
        span stopped reading as one statement — the same defect the long
        form had when it was a paragraph. A slash reads as a ratio and
        costs four characters less than "of".
      */}
      <span className="t-readout col-start-2 row-start-2 flex flex-wrap items-baseline gap-x-2 whitespace-nowrap text-[13px] tabular-nums text-ink-3 sm:col-start-4 sm:row-start-1 sm:flex-col sm:items-end sm:gap-0">
        <span className="text-ink-2">
          {row.checks === 0 ? 'No checks' : `${formatCount(row.answered)} / ${formatCount(row.checks)}`}
        </span>
        {row.checks > 0 && <span className="text-[12px]">{formatObservedSpan(row.observedDays)}</span>}
      </span>
    </li>
  );
}

/**
 * Every category in one list, or one category when chosen.
 *
 * Ranked by answer rate across the categories in view, then the agents with
 * too few checks to rank, unordered by rate and said to be so. Ranked first
 * and searched after, so a row keeps its standing whatever a search leaves.
 */
function ResponsivenessList({
  board,
  browse,
  current,
  merged,
}: {
  board: ResponsivenessBoard;
  browse: BrowseQuery;
  current: BoardSelection;
  merged: boolean;
}) {
  const inView = board.categories.filter((entry) => merged || entry.category === browse.category);
  const ranked = sortResponsivenessRows(inView.flatMap((entry) => entry.ranked)).map((row, index) => ({ row, rank: index + 1 as number | null }));
  const below = inView
    .flatMap((entry) => entry.belowMinimum)
    .sort((a, b) => b.checks - a.checks || a.agent.name.localeCompare(b.agent.name))
    .map((row) => ({ row, rank: null as number | null }));
  const page = pageOf([...ranked, ...below], ({ row }) => matchesBrowse(row.agent, browse), browse);
  const podium = podiumOf(page.rows, browse, page.page);
  const onPodium = new Set(podium.map(({ row }) => row.agent.key));
  const rows = page.rows.filter(({ row }) => !onPodium.has(row.agent.key));
  const rankedRows = rows.filter(({ rank }) => rank !== null);
  const belowRows = rows.filter(({ rank }) => rank === null);
  const sub = (row: ResponsivenessRow) => (merged ? categoryLabel(row.agent.category) : null);
  if (page.matched === 0) {
    return (
      <EmptyState title="Nothing on this board matches these filters" className="mt-6">
        Clearing them shows the agents this board holds.
      </EmptyState>
    );
  }
  return (
    <>
      <Podium
        entries={podium.map(({ row, rank }) => ({
          agent: row.agent,
          rank,
          value: formatPercent(row.answerRate, { decimals: 1 }),
          label: 'Answer rate',
          sub: sub(row),
        }))}
      />
      {ranked.length === 0 && page.page === 1 && (
        <p className="border-b border-rule bg-sunken/50 px-4 py-3 text-[13px] text-ink-2">
          No agent here has {MIN_RESPONSIVENESS_CHECKS} checks in the last {RESPONSIVENESS_WINDOW_DAYS} days, so Pokter
          publishes no order. Every listed agent is below, with whatever checks Pokter has for it, which for some is none.
        </p>
      )}
      {rankedRows.length > 0 && (
        <>
          <ResponsivenessHeader />
          <ol className="divide-y divide-rule">
            {rankedRows.map(({ row, rank }) => (
              <ResponsivenessLine key={row.agent.key} row={row} rank={rank} sub={sub(row)} />
            ))}
          </ol>
        </>
      )}
      {/*
        Flat, like everything else: the agents with the least evidence are
        listed with their figures and no rank, which is what unranked looks
        like, rather than hidden behind a press.
      */}
      {belowRows.length > 0 && (
        <div className={rankedRows.length > 0 ? 'mt-4' : ''}>
          <p className="border-t border-rule pt-3 text-[12.5px] text-ink-3">
            {formatCount(below.length)} agent{below.length === 1 ? '' : 's'} with too few checks to rank, listed with
            their figures and left unordered. A rate out of a handful of attempts is not a low rate, it is no
            measurement.
          </p>
          <ol className="mt-1 divide-y divide-rule">
            {belowRows.map(({ row }) => (
              <ResponsivenessLine key={row.agent.key} row={row} rank={null} sub={sub(row)} />
            ))}
          </ol>
        </div>
      )}
      {page.pages > 1 && (
        <div className="mt-4 flex justify-end">
          <Pagination page={page} current={current} browse={browse} />
        </div>
      )}
    </>
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

  const [scoreBoard, outcomes, responsiveness] = await Promise.all([
    view === 'score' ? loadScoreBoard(network) : Promise.resolve(null),
    view === 'outcomes' ? loadOutcomeBoard(network, metric) : Promise.resolve(null),
    view === 'responsiveness' ? loadResponsivenessBoard(network) : Promise.resolve(null),
  ]);


  /* Every agent the board holds, before any narrowing, so the category chips
     show the board's own distribution rather than the filtered one — a chip
     whose count changes when you press it is a count of nothing. */
  const boardAgents: BoardAgent[] =
    scoreBoard?.state === 'ready'
      ? scoreBoard.data.rows.map((row) => row.agent)
      : outcomes?.state === 'ready'
      ? outcomes.data.rows.map((row) => row.agent)
      : responsiveness?.state === 'ready'
        ? responsiveness.data.categories.flatMap((entry) =>
            [...entry.ranked, ...entry.belowMinimum].map((row) => row.agent),
          )
        : [];
  /* What the board read, from whichever board is showing. Null when the
     read failed, so the header says nothing rather than nought. */
  const agentsRead: number | null =
    scoreBoard?.state === 'ready'
      ? scoreBoard.data.coverage.listedAgents
      : outcomes?.state === 'ready'
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
    scoreBoard?.state === 'ready'
      ? scoreBoard.data.coverage.lastRefreshedAt
      : outcomes?.state === 'ready'
      ? outcomes.data.coverage.lastRefreshedAt
      : responsiveness?.state === 'ready'
        ? responsiveness.data.coverage.lastCheckedAt
        : null;
  const boardMeta = [periodOf(view).value, view === 'outcomes' ? null : `At least ${MIN_RESPONSIVENESS_CHECKS} checks`]
    .filter(Boolean)
    .join(' · ');

  /*
   * The apparatus: how much was read, how much of it ranked, and when.
   * Still published, under the table rather than over it — these are facts
   * about the data, and a reader scanning a list does not need a counter
   * in front of the list to scan it.
   */
  const boardCoverage = [
    view === 'score' && scoreBoard?.state === 'ready'
      ? `${formatCount(scoreBoard.data.coverage.ranked)} of ${formatCount(scoreBoard.data.coverage.listedAgents)} ranked`
      : null,
    view === 'outcomes' && outcomes?.state === 'ready'
      ? `${formatCount(outcomes.data.coverage.indexedJobs)} indexed, ${formatCount(outcomes.data.coverage.qualifyingJobs)} qualifying`
      : null,
    agentsRead !== null ? `${formatCount(agentsRead)} agents read` : null,
    lastRead ? `updated ${timestamp(lastRead)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const counts = categoryCounts(boardAgents);
  /* All by default on every board: one merged list, narrowed by category when chosen. */
  const merged = browse.category === ALL_CATEGORIES;
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
      {/*
        Air, deliberately. Every pass before this one bought density: a
        tighter title, a meta line carrying five facts, a sentence under
        the controls explaining the category. All of it was true and all of
        it made the page feel like a report. The rows are the page, so
        everything above them is title, one line, one choice, and nothing
        else — and the facts that lost their place moved under the table
        rather than off it.
      */}
      <header className="flex flex-wrap items-start justify-between gap-x-2 gap-y-3 sm:flex-nowrap sm:gap-x-4">
        {/* Sized by the title, not the subtitle, so the toggle shares the title's line wherever both fit. */}
        <div className="flex min-w-min flex-1 basis-0 flex-col gap-2">
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] sm:text-[42px]">Leaderboard</h1>
          <p className="text-[15px] text-ink-2 sm:text-[17px]">Compare agents by observed results.</p>
        </div>
        <div className="shrink-0 pt-0.5 sm:pt-2.5">
          <NetworkToggle value={network} href={(value) => leaderboardHref({ ...current, network: value }, { ...browse, page: 1 })} />
        </div>
      </header>
      <DismissMenus />

      <div className="mt-9 flex flex-col gap-4 border-b border-rule sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <nav aria-label="What is measured" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-7">
            {(
              [
                { id: 'score', label: 'Pokter Score' },
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
                    'relative -mb-px flex h-11 items-center whitespace-nowrap border-b-2 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40',
                    tab.id === view ? 'border-signal text-ink' : 'border-transparent text-ink-3 hover:text-ink',
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Beside the tabs, not under them: one row of choices, not two. */}
        <div className="flex flex-wrap items-center gap-2 pb-3 sm:pb-2.5">
          {categoryOptions.length > 1 && (
            <LinkMenu<Classification | typeof ALL_CATEGORIES>
              label="Category"
              value={browse.category}
              options={categoryOptions}
              href={(value) => leaderboardHref(current, { search: browse.search, category: value, page: 1 })}
            />
          )}
          <div className="w-full sm:w-52">
            <SearchField />
          </div>
        </div>
      </div>

      {/*
        Two facts, the two a figure here is misread without: the window it
        was taken in and the sample an agent needs to be ranked at all.
        This line used to carry five, which is a sentence pretending to be
        a caption. How much was read and how fresh it is are facts about
        the data rather than about any row, so they sit under the table
        with the rest of the apparatus.
      */}
      <div className="mt-6 mb-7 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px] text-ink-3">
        <p>{boardMeta}</p>
        <Link
          href={LEADERBOARD_METHOD_HREF}
          className="inline-flex items-center gap-1 font-medium text-ink-2 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
        >
          How rankings work <Icon.ArrowUpRight size={12} />
        </Link>
      </div>

      {view === 'score' && scoreBoard && (
        <section aria-labelledby="score-title">
          <h2 id="score-title" className="sr-only">
            Pokter Score
          </h2>
          {scoreBoard.state === 'unavailable' ? (
            <BoardUnavailable reason={scoreBoard.reason} retryHref={leaderboardHref(current, browse)}>
              Pokter could not read the registry or the job index for this board, so it is showing nothing rather
              than a zero. An empty board would claim no agent has a record, which this read does not establish.
            </BoardUnavailable>
          ) : (
            (() => {
              /*
                All categories together by default, one category when chosen.
                The score is computed the same way for every agent, out of the
                same 100, so the merged order is the model's own; each row
                names its category so a reader weighs a figure against the
                work it measures.

                Ranked first, then searched, so a row keeps its standing
                rather than taking the position a search left it in.
              */
              const inView = scoreBoard.data.rows
                .filter((row) => merged || row.category === browse.category)
                .map((row, index) => ({ row, rank: index + 1 }));
              const page = pageOf(inView, ({ row }) => matchesBrowse(row.agent, browse), browse);
              const unrankedHere = scoreBoard.data.unranked.filter((row) => merged || row.category === browse.category);
              if (page.matched === 0) {
                return browse.search.trim() || !merged ? (
                  <div className="py-14 text-center">
                    <p className="text-[15px] font-medium text-ink">No agent here matches these filters.</p>
                    <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-2">
                      {formatCount(scoreBoard.data.coverage.ranked)} agent
                      {scoreBoard.data.coverage.ranked === 1 ? ' is' : 's are'} ranked on this network. Clearing the
                      filters shows {scoreBoard.data.coverage.ranked === 1 ? 'it' : 'them'}.
                    </p>
                  </div>
                ) : (
                  <div className="py-14 text-center">
                    <p className="text-[15px] font-medium text-ink">No agent on this network meets the evidence bar yet.</p>
                    <p className="mx-auto mt-2 max-w-lg text-[13px] text-ink-2">
                      An agent is ranked once Pokter has {MIN_CHECKS} checks for it and one paid job has reached
                      delivery or its deadline. {formatCount(scoreBoard.data.coverage.listedAgents)} agents are listed
                      here; {formatCount(scoreBoard.data.coverage.withResolvedJob)} have a resolved paid job.
                    </p>
                  </div>
                );
              }
              const podium = podiumOf(page.rows, browse, page.page);
              const onPodium = new Set(podium.map(({ row }) => row.agent.key));
              return (
                <>
                  <Podium
                    entries={podium.map(({ row, rank }) => ({
                      agent: row.agent,
                      rank,
                      value: String(Math.round(row.score.overall ?? 0)),
                      label: 'Pokter Score',
                      sub: merged ? categoryLabel(row.category) : null,
                    }))}
                  />
                  <ScoreTable rows={page.rows.filter(({ row }) => !onPodium.has(row.agent.key))} merged={merged} />
                  {page.pages > 1 && (
                    <div className="mt-4 flex justify-end">
                      <Pagination page={page} current={current} browse={browse} />
                    </div>
                  )}
                  {/*
                    Said, not hidden: these agents are not at the bottom of
                    the table with a nought, they are absent from it, and a
                    reader is owed the number and the reason.
                  */}
                  {unrankedHere.length > 0 && (
                    <p className="mt-5 border-t border-rule pt-4 text-[12.5px] text-ink-3">
                      {formatCount(unrankedHere.length)} more agent{unrankedHere.length === 1 ? '' : 's'} here
                      {unrankedHere.length === 1 ? ' is' : ' are'} unranked. {UNRANKED_COPY['no-resolved-jobs']}
                    </p>
                  )}
                </>
              );
            })()
          )}
        </section>
      )}

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
                    {(() => {
                      const podium = podiumOf(outcomePage.rows, browse, outcomePage.page);
                      const onPodium = new Set(podium.map(({ row }) => row.agent.key));
                      const active = OUTCOME_METRIC_BY_ID.get(metric)!;
                      return (
                        <>
                          <Podium
                            entries={podium.map(({ row, rank }) => ({
                              agent: row.agent,
                              rank,
                              value: formatCount(outcomeMetricValue(row, metric)),
                              label: active.short,
                              sub: merged ? categoryLabel(row.agent.category) : null,
                            }))}
                          />
                          <OutcomeHeader active={active} />
                          <ol className="divide-y divide-rule">
                            {outcomePage.rows
                              .filter(({ row }) => !onPodium.has(row.agent.key))
                              .map(({ row, rank }) => (
                                <OutcomeLine key={row.agent.key} row={row} rank={rank} current={current} />
                              ))}
                          </ol>
                        </>
                      );
                    })()}
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
                <ResponsivenessList board={responsiveness.data} browse={browse} current={current} merged={merged} />
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
      <footer className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-rule pt-5 text-[12.5px] text-ink-3">
        <p>
          {view === 'responsiveness'
            ? ANSWER_RATE_SHORT
            : view === 'score'
              ? 'An operational record: work delivered and checks answered. Not a measure of whether an answer was correct or useful.'
              : 'Settled jobs, not a measure of whether the answer was useful.'}
        </p>
        {boardCoverage && <p className="t-readout text-[12px]">{boardCoverage}</p>}
      </footer>

    </div>
  );
}
