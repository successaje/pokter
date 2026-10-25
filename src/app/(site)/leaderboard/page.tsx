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
  MAX_SEARCH,
  pageLinks,
  pageOf,
  type BrowseQuery,
  type Page,
} from '@/lib/leaderboard/browse';
import {
  CONSISTENT_STANDINGS,
  DIVERGENT_STANDINGS,
  SERVES_FROM_ONE_INSTANCE,
} from '@/lib/leaderboard/consistency';
import {
  rowDisclosures,
  rowReceipts,
  summaryOf,
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
  rankOutcomeRows,
  type OutcomeBoard,
  type OutcomeMetricMeta,
  type OutcomeRow,
  type RankedOutcomeRow,
} from '@/lib/leaderboard/outcomes';
import { periodOf } from '@/lib/leaderboard/period';
import {
  ANSWER_RATE_COLUMN,
  ANSWER_RATE_DOES_NOT_MEAN,
  ANSWER_RATE_MEANS,
  formatObservedSpan,
  MIN_RESPONSIVENESS_CHECKS,
  observedSpanDetail,
  observedSpanHeadline,
  RESPONSIVENESS_WINDOW_DAYS,
  type CategoryResponsiveness,
  type ResponsivenessRow,
} from '@/lib/leaderboard/responsiveness';
import { loadOutcomeBoard, loadResponsivenessBoard } from '@/lib/leaderboard/server';
import { chainLabel, escrowMoney } from '@/lib/network/presentation';
import { shareMetadata } from '@/lib/og/share';
import { cn } from '@/lib/ui/cn';
import { formatCount, formatPercent } from '@/lib/ui/format';
import { AgentAvatar } from '@/ui/Agent';
import { buttonClass } from '@/ui/Button';
import { Details } from '@/ui/Data';
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
 * The board's period, stated and not chosen.
 *
 * It looks like the other controls in the bar and is deliberately not one.
 * See `lib/leaderboard/period.ts`: the outcomes board has no rolling window
 * to offer, and a selector implying one would describe a filter the page
 * does not apply. The note is carried in `title` and read out by assistive
 * tech so the reason travels with the figure.
 */
function PeriodFact({ view }: { view: BoardView }) {
  const period = periodOf(view);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="t-label">{period.label}</span>
      <p
        className="flex items-center gap-1.5 rounded-[10px] border border-dashed border-rule-strong px-2.5 py-[7px] text-[12.5px] text-ink-2"
        title={period.note}
      >
        <Icon.Clock size={13} className="shrink-0 text-ink-3" />
        <span className="truncate">{period.value}</span>
        {/* The whole note is printed once, in the board's own heading block.
            Here it would be heard twice and read nowhere. */}
        <span className="sr-only"> — stated, not a control</span>
      </p>
    </div>
  );
}

/**
 * Search as a plain GET form.
 *
 * No client component, so it works before hydration and the result is a URL
 * somebody can send to a colleague. The other choices ride along as hidden
 * fields; `page` deliberately does not, because a new search starts at the
 * first page of its own results rather than at the eighth page of someone
 * else's.
 */
function SearchForm({ current, browse }: { current: BoardSelection; browse: BrowseQuery }) {
  return (
    /* Its own line at phone width. Sharing one with the network and period
       troughs, `flex-1` left it about 90px wide: the label broke over three
       lines and the field and its button ran off the edge of the screen. */
    <form
      method="get"
      action="/leaderboard"
      className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:min-w-[16rem] sm:flex-1"
    >
      {current.network !== 'mainnet' && <input type="hidden" name="network" value={current.network} />}
      {current.view !== 'outcomes' && <input type="hidden" name="view" value={current.view} />}
      {current.view === 'outcomes' && current.metric !== 'settled-jobs' && (
        <input type="hidden" name="metric" value={current.metric} />
      )}
      {browse.category !== ALL_CATEGORIES && <input type="hidden" name="category" value={browse.category} />}
      <label htmlFor="board-search" className="t-label">
        Search this board
      </label>
      <div className="flex gap-2">
        <span className="relative flex min-w-0 flex-1 items-center">
          <Icon.Search size={14} className="pointer-events-none absolute left-3 text-ink-3" />
          <input
            id="board-search"
            name="q"
            type="search"
            defaultValue={browse.search}
            maxLength={MAX_SEARCH}
            placeholder="Agent name"
            className="h-[34px] w-full rounded-[9px] border border-rule-strong bg-raised pl-8 pr-3 text-[13px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-4 focus:ring-[color-mix(in_oklab,var(--signal)_30%,transparent)]"
          />
        </span>
        <button type="submit" className={buttonClass('secondary', 's')}>
          Search
        </button>
        {browse.search.length > 0 && (
          <Link
            href={leaderboardHref(current, { category: browse.category })}
            scroll={false}
            className={buttonClass('ghost', 's')}
          >
            Clear
          </Link>
        )}
      </div>
    </form>
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

function CoverageLine({ items }: { items: ReadonlyArray<{ label: string; value: string }> }) {
  return (
    <dl className="grid gap-px overflow-hidden rounded-[12px] border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-raised p-4">
          <dt className="t-label">{item.label}</dt>
          <dd className="t-readout mt-1 text-[15px]">{item.value}</dd>
        </div>
      ))}
    </dl>
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
 * One agent as one thing: picture, name, and what it is underneath.
 *
 * The registry chain stays on the row because it can differ from the escrow
 * the board is split by, which the section above says in words. The escrow's
 * currency does not: it is the same on every row of a board whose heading
 * already names it, and repeating it on each row bought nothing but height.
 */
function AgentCell({ agent, listed, size = 34 }: { agent: BoardAgent; listed: boolean; size?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <AgentAvatar name={agent.name} imageUrl={agent.imageUrl} seed={agent.key} size={size} />
      <span className="min-w-0">
        {listed ? (
          <Link
            href={`/agents/${agent.chainId}/${agent.tokenId}`}
            className="block truncate text-[13.5px] font-medium hover:underline"
          >
            {agent.name}
          </Link>
        ) : (
          <span className="block truncate text-[13.5px] font-medium">{agent.name}</span>
        )}
        <span className="mt-0.5 block truncate text-[11.5px] font-normal text-ink-3">
          {categoryLabel(agent.category)} &middot; registered on {chainLabel(agent.chainId)}
        </span>
      </span>
    </span>
  );
}

/**
 * A figure with the fact that qualifies it underneath.
 *
 * The second line is never a second measurement dressed as support: each one
 * below is about the same wallets or the same checks as the figure above it.
 * A detail that belongs to a different population would read as part of this
 * figure, which is how a table acquires a composite nobody chose.
 */
function Readout({
  value,
  detail,
  tone = 'neutral',
  active,
}: {
  value: string;
  detail?: string | null;
  tone?: 'neutral' | 'watch' | 'quiet';
  active?: boolean;
}) {
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className={cn('t-readout text-[14px]', active && 'font-medium', tone === 'quiet' && 'text-ink-2')}>
        {value}
      </span>
      {detail && (
        <span className={cn('text-[11px] leading-tight', tone === 'watch' ? 'text-watch' : 'text-ink-3')}>
          {detail}
        </span>
      )}
    </span>
  );
}

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

/**
 * Everything the row has to admit, one toggle down and named on the toggle.
 *
 * The summary is built from the same list the body renders
 * (`lib/leaderboard/disclosures.ts`), so the closed state cannot come to
 * describe something the open state does not contain. A row with nothing to
 * disclose renders no toggle rather than an empty one.
 */
function RowDisclosures({ row }: { row: OutcomeRow }) {
  const disclosures = rowDisclosures(row);
  const receipts = rowReceipts(row);
  const summary = summaryOf(disclosures, receipts);
  if (!summary) return null;
  return (
    <details className="group rounded-[9px] border border-rule bg-sunken/50 px-2.5 py-1.5 open:bg-sunken">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11.5px] [&::-webkit-details-marker]:hidden">
        <Icon.ChevronRight
          size={12}
          className="shrink-0 text-ink-3 transition-transform duration-150 group-open:rotate-90"
        />
        <span className={cn('min-w-0 flex-1', hasWatch(disclosures) ? 'text-watch' : 'text-ink-2')}>{summary}</span>
      </summary>
      <div className="mt-2 flex flex-col gap-2 border-t border-rule pt-2 text-[11.5px] leading-relaxed">
        {disclosures.map((disclosure: Disclosure) => (
          <p key={disclosure.id} className={disclosure.tone === 'watch' ? 'text-watch' : 'text-ink-2'}>
            {disclosure.detail}
            {disclosure.jobs.length > 0 && (
              <span className="mt-1 block">
                <ReceiptLinks jobs={disclosure.jobs} label={disclosure.jobsLabel} />
              </span>
            )}
          </p>
        ))}
        {receipts.map((group) => (
          <p key={group.label} className="flex flex-wrap items-baseline gap-x-2 text-ink-3">
            <span>{group.label}:</span>
            <ReceiptLinks jobs={group.jobs} label={group.label} />
          </p>
        ))}
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ *
 * Customer outcomes
 * ------------------------------------------------------------------ */

/**
 * A column header that says it produced the order, and offers to.
 *
 * The arrow is the part the old header was missing: the sorted column was
 * washed in signal yellow and nothing said which way it ran, so "highest
 * first" lived only in the caption no sighted reader sees. The inactive
 * headers show their arrow on hover and focus, so the table looks sortable
 * before anyone guesses that the headers are links.
 */
function MetricHeader({
  metric,
  active,
  current,
  browse,
}: {
  metric: OutcomeMetricMeta;
  active: boolean;
  current: BoardSelection;
  browse: BrowseQuery;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? 'descending' : 'none'}
      className={cn(
        'px-3 py-2.5 text-right align-bottom font-medium',
        active ? 'bg-signal-wash text-ink' : 'text-ink-3',
      )}
    >
      <Link
        href={leaderboardHref({ ...current, metric: metric.id }, { ...browse, page: 1 })}
        scroll={false}
        className="group inline-flex max-w-[13rem] flex-col items-end gap-0.5 hover:text-ink focus-visible:text-ink"
      >
        <span className="flex items-center gap-1">
          <span className="t-label text-inherit">{metric.short}</span>
          <Icon.ChevronDown
            size={12}
            className={cn(
              'shrink-0 transition-opacity',
              active ? 'opacity-100' : 'opacity-0 group-hover:opacity-50 group-focus-visible:opacity-50',
            )}
          />
        </span>
        <span className="text-[10.5px] font-normal leading-tight text-ink-3">{metric.qualifier}</span>
        <span className="sr-only">
          {metric.column}
          {active ? ' — ordering this table, highest first' : ' — order the table by this column'}
        </span>
      </Link>
    </th>
  );
}

function OutcomeTable({
  board,
  page,
  current,
  browse,
}: {
  board: OutcomeBoard;
  page: Page<RankedOutcomeRow>;
  current: BoardSelection;
  browse: BrowseQuery;
}) {
  const active = OUTCOME_METRIC_BY_ID.get(board.metric)!;
  return (
    <div className="hidden overflow-x-auto rounded-[14px] border border-rule md:block">
      <table className="w-full min-w-[960px] divide-y divide-rule text-left text-[13px]">
        <caption className="sr-only">
          Agents on {chainLabel(board.escrowChainId)}, ordered by {active.column}, highest first.
        </caption>
        <thead className="bg-sunken/70">
          <tr>
            <th scope="col" className="t-label w-12 px-3 py-2.5 align-bottom font-medium">
              Rank
            </th>
            <th scope="col" className="t-label px-3 py-2.5 align-bottom font-medium">
              Agent
            </th>
            {OUTCOME_METRICS.map((metric) => (
              <MetricHeader
                key={metric.id}
                metric={metric}
                active={metric.id === board.metric}
                current={current}
                browse={browse}
              />
            ))}
            <th scope="col" className="px-3 py-2.5 text-right align-bottom font-medium text-ink-3">
              <span className="inline-flex max-w-[9rem] flex-col items-end gap-0.5">
                <span className="t-label text-inherit">Delivered</span>
                <span className="text-[10.5px] font-normal leading-tight text-ink-3">escrow not released</span>
              </span>
            </th>
            <th scope="col" className="t-label px-3 py-2.5 align-bottom font-medium">
              Evidence
            </th>
          </tr>
        </thead>
        {page.rows.map(({ row, rank }) => (
          <OutcomeRowGroup key={row.agent.key} row={row} rank={rank} current={current} />
        ))}
      </table>
    </div>
  );
}

function OutcomeRowGroup({
  row,
  rank,
  current,
}: {
  row: OutcomeRow;
  rank: number | null;
  current: BoardSelection;
}) {
  const disclosed = summaryOf(rowDisclosures(row), rowReceipts(row)) !== null;
  return (
    <tbody className="bg-raised">
      <tr>
        {/*
          No number where the ordering column holds a nought. `rankOutcomeRows`
          has the account of what this printed before.
        */}
        <td className="t-readout px-3 py-3 align-top text-[13px] text-ink-3">
          {rank === null ? '—' : String(rank).padStart(2, '0')}
        </td>
        <th scope="row" className="px-3 py-3 align-top font-medium">
          <AgentCell agent={row.agent} listed={row.listed} />
        </th>
        <td
          className={cn('px-3 py-3 text-right align-top', current.metric === 'settled-jobs' && 'bg-signal-wash')}
        >
          <Readout value={formatCount(row.settledJobs)} active={current.metric === 'settled-jobs'} />
        </td>
        <td
          className={cn('px-3 py-3 text-right align-top', current.metric === 'external-buyers' && 'bg-signal-wash')}
        >
          {/*
            The operator-buyer disclosure belongs to these wallets and to no
            other figure on the row, so it sits under them rather than in the
            paragraph that used to carry every qualification at once.
          */}
          <Readout
            value={formatCount(row.externalBuyers)}
            detail={
              row.operatorBuyers > 0
                ? `${formatCount(row.operatorBuyers)} ${row.operatorBuyers === 1 ? 'owns' : 'own'} a listed agent`
                : null
            }
            tone="watch"
            active={current.metric === 'external-buyers'}
          />
        </td>
        <td
          className={cn('px-3 py-3 text-right align-top', current.metric === 'repeat-buyers' && 'bg-signal-wash')}
        >
          <Readout
            value={formatCount(row.repeatBuyers)}
            detail={
              row.externalBuyers > 0
                ? `of ${formatCount(row.externalBuyers)} wallet${row.externalBuyers === 1 ? '' : 's'}`
                : null
            }
            active={current.metric === 'repeat-buyers'}
          />
        </td>
        <td className="px-3 py-3 text-right align-top">
          <Readout value={formatCount(row.deliveredUnsettled)} tone="quiet" />
        </td>
        <td className="px-3 py-3 align-top">
          <EvidenceCell row={row} current={current} />
        </td>
      </tr>
      {disclosed && (
        <tr>
          <td colSpan={7} className="px-3 pb-3">
            <RowDisclosures row={row} />
          </td>
        </tr>
      )}
    </tbody>
  );
}

/**
 * The same row at phone width, as a card.
 *
 * A seven-column table at 375px is a table nobody reads: it scrolls
 * sideways and the figure a reader scrolled to loses the name it belongs
 * to. Both shapes take the same ranked row and the same
 * `rowDisclosures`, so only the layout differs — no figure and no
 * disclosure exists in one and not the other.
 */
function OutcomeCards({
  board,
  page,
  current,
}: {
  board: OutcomeBoard;
  page: Page<RankedOutcomeRow>;
  current: BoardSelection;
}) {
  const active = OUTCOME_METRIC_BY_ID.get(board.metric)!;
  return (
    <ol className="flex flex-col gap-3 md:hidden">
      {page.rows.map(({ row, rank }) => (
        <li key={row.agent.key} className="rounded-[12px] border border-rule bg-raised p-3.5">
          <div className="flex items-start gap-2.5">
            <span className="t-readout mt-1 w-7 shrink-0 text-[13px] text-ink-3">
              {rank === null ? '—' : String(rank).padStart(2, '0')}
            </span>
            <AgentCell agent={row.agent} listed={row.listed} size={32} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-rule pt-3">
            {[
              {
                id: 'settled-jobs',
                label: OUTCOME_METRIC_BY_ID.get('settled-jobs')!.short,
                value: formatCount(row.settledJobs),
                detail: null as string | null,
              },
              {
                id: 'external-buyers',
                label: OUTCOME_METRIC_BY_ID.get('external-buyers')!.short,
                value: formatCount(row.externalBuyers),
                detail:
                  row.operatorBuyers > 0
                    ? `${formatCount(row.operatorBuyers)} ${row.operatorBuyers === 1 ? 'owns' : 'own'} a listed agent`
                    : null,
              },
              {
                id: 'repeat-buyers',
                label: OUTCOME_METRIC_BY_ID.get('repeat-buyers')!.short,
                value: formatCount(row.repeatBuyers),
                detail:
                  row.externalBuyers > 0
                    ? `of ${formatCount(row.externalBuyers)} wallet${row.externalBuyers === 1 ? '' : 's'}`
                    : null,
              },
              {
                id: 'delivered',
                label: 'Delivered',
                value: formatCount(row.deliveredUnsettled),
                detail: 'escrow not released',
              },
            ].map((cell) => (
              <div
                key={cell.id}
                className={cn(
                  'rounded-[8px] px-2 py-1.5',
                  cell.id === board.metric ? 'bg-signal-wash' : 'bg-sunken/50',
                )}
              >
                <dt className="t-label text-[10px]">{cell.label}</dt>
                <dd className="t-readout mt-0.5 text-[15px]">{cell.value}</dd>
                {cell.detail && (
                  <dd
                    className={cn(
                      'text-[10.5px] leading-tight',
                      cell.id === 'external-buyers' && row.operatorBuyers > 0 ? 'text-watch' : 'text-ink-3',
                    )}
                  >
                    {cell.detail}
                  </dd>
                )}
              </div>
            ))}
          </dl>
          <p className="t-label mt-2.5 text-[10px]">Ordered by {active.short}</p>
          <div className="mt-2 flex flex-col gap-2">
            <RowDisclosures row={row} />
            <EvidenceCell row={row} current={current} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ *
 * Responsiveness
 * ------------------------------------------------------------------ */

/*
 * Two columns at phone width, five above `sm`.
 *
 * The mobile half used to be left implicit: a bare `grid` with three cells
 * carrying `col-start-2`, which conjures a second column whose width comes
 * from whatever happens to be in it. Each row sized its own columns, so the
 * avatars stepped left and right down the list by thirty or forty pixels and
 * the rate under each name started at a different place on every row. Naming
 * the mobile template fixes the rank gutter and lines the rows up.
 */
const RESPONSIVENESS_GRID =
  'grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_6rem_11rem_6.5rem]';

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
      <span className="t-label">Rank</span>
      <span className="t-label">Agent</span>
      <span className="t-label flex items-center justify-end gap-1 text-right text-ink">
        Answer rate <Icon.ChevronDown size={12} aria-hidden />
      </span>
      <span className="t-label text-right">Checks, and the span behind them</span>
      <span className="t-label">Evidence</span>
    </div>
  );
}

function ResponsivenessLine({ row, rank }: { row: ResponsivenessRow; rank: number | null }) {
  return (
    /* The fourth column holds two lines — the denominator and the span it
       was taken over — so it is wide enough for "over 29.9 of 30 days" to sit
       on one line. Wrapped, the span read as two ragged fragments and stopped
       looking like one statement about one row. */
    <li className={cn(RESPONSIVENESS_GRID, 'py-3 sm:items-center')}>
      <span className="t-readout text-[13px] text-ink-3">{rank === null ? '—' : String(rank).padStart(2, '0')}</span>
      <span className="flex min-w-0 items-center gap-2.5">
        <AgentAvatar name={row.agent.name} imageUrl={row.agent.imageUrl} seed={row.agent.key} size={32} />
        <span className="min-w-0">
          <Link
            href={`/agents/${row.agent.chainId}/${row.agent.tokenId}`}
            className="block truncate text-[13.5px] font-medium hover:underline"
          >
            {row.agent.name}
          </Link>
          <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
            Declared protocol: {row.protocol ?? 'none declared'}
          </span>
        </span>
      </span>
      <span className="t-readout col-start-2 text-[15px] sm:col-start-auto sm:text-right">
        {/*
          One decimal, because nought rounded 349 of 350 up to "100%".
          That was the top row of the production board: a check had failed
          and the headline figure said none had. The denominator beside it
          kept the row honest, but "100%" is what gets quoted once it is
          separated from "349 of 350" — the same defect as the nought on the
          share card, a number that becomes a claim when it travels alone.

          A genuine 350 of 350 still reads 100%. Display only: the ordering
          and the tie-break read the unrounded rate, so rows that tie here
          tie on the real figure.
        */}
        {row.ranked ? formatPercent(row.answerRate, { decimals: 1 }) : '—'}
      </span>
      {/*
        "0 of 0 checks" read as an agent that answered nothing, when the fact
        is that Pokter asked nothing of it inside the window. Said in words,
        because a row whose rate is already an em dash needs to say which of
        the two it is.
      */}
      <span className="t-readout col-start-2 flex flex-col gap-0.5 text-[12px] text-ink-3 sm:col-start-auto sm:items-end sm:text-right">
        <span>
          {row.checks === 0
            ? 'No check in this window'
            : `${formatCount(row.answered)} of ${formatCount(row.checks)} checks`}
        </span>
        {/*
          The span sits under the denominator, not under the name, because the
          denominator is where a reader is already weighing how much is behind
          the rate — and the two are one fact. "349 of 350 checks" alone reads
          as a full 30-day record on every row it appears on, and on this data
          the rows above and below it can cover a twelfth of that period. A
          row with no check has no span to report and says nothing here rather
          than printing a nought, which would read as a measured zero-length
          history instead of an absent one.
        */}
        {row.checks > 0 && <span>{formatObservedSpan(row.observedDays)}</span>}
      </span>
      <span className="col-start-2 sm:col-start-auto">
        <Link
          href={`/agents/${row.agent.chainId}/${row.agent.tokenId}#history`}
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink hover:underline"
        >
          Check history <Icon.ArrowUpRight size={12} className="text-ink-3" />
        </Link>
      </span>
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
        <div>
          <span className="t-label">{category.label}</span>
          <h3 id={`responsiveness-${entry.category}`} className="t-h3 mt-1">
            {formatCount(entry.ranked.length)} agent{entry.ranked.length === 1 ? '' : 's'} with at least{' '}
            {MIN_RESPONSIVENESS_CHECKS} checks in the window
          </h3>
        </div>
        <span className="text-[12px] text-ink-3">Compared only against others in this category.</span>
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

  const escrowChainId = escrowChainOf(network);
  const money = escrowMoney(escrowChainId);
  const activeMetric = OUTCOME_METRIC_BY_ID.get(metric)!;

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
    <div className="frame pb-24 pt-10 sm:pt-16">
      {/*
        The board is the page. This header used to run to a lede, a side
        card and two links before a reader reached a single row, and the
        rows are the only thing here anybody came for. Everything the page
        owes a reader about how the figures were made is still on it — it
        now sits under the table it qualifies, where it is read after the
        number rather than instead of it.
      */}
      <header className="flex flex-col gap-3 border-b border-rule pb-6">
        <span className="t-label flex items-center gap-2">
          <span className="tile" aria-hidden /> Leaderboard
        </span>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="t-display">{TITLE}</h1>
          {/*
            The agents this board read, not the rows it ended up with.
            `boardAgents.length` is the row count, which on the mainnet
            outcomes board is nought while the strip below it says 176
            agents were read — a reader meets "0 agents on BNB Chain"
            first and it reads as a claim about the marketplace rather
            than about qualifying settlements. That is close enough to the
            sentence this page exists to avoid that it is not worth the
            one word it saved.
          */}
          {agentsRead !== null && (
            <p className="text-[14px] text-ink-2">
              {formatCount(agentsRead)} agent{agentsRead === 1 ? '' : 's'} read on{' '}
              {chainLabel(view === 'outcomes' ? escrowChainId : registryChainOf(network))}
            </p>
          )}
        </div>
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          Two boards, never blended: what buyers paid for, and what answered a check.{' '}
          <span className="text-ink">There is no overall score</span> — the column you sorted by is the whole
          explanation of the order.{' '}
          <Link href="/methodology" className="font-medium text-ink hover:underline">
            How ranking works
          </Link>
        </p>
      </header>

      {/*
        The two boards as tabs, because they are two answers to two questions
        and a reader picks one. The remaining controls narrow whichever board
        is showing, so they sit under the tab rather than beside it.
      */}
      <nav aria-label="What is measured" className="no-scrollbar -mx-4 overflow-x-auto px-4 pt-6 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-6 border-b border-rule">
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
                  'relative -mb-px flex h-11 items-center border-b-2 text-sm font-medium transition-colors',
                  tab.id === view ? 'border-signal text-ink' : 'border-transparent text-ink-3 hover:text-ink',
                )}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label="Narrow this board" className="flex flex-col gap-4 border-b border-rule py-5">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          {/* Just "Network". That the two boards are never merged is a
              guarantee, not a control label, and the header now makes it
              once for the page instead of inside a form field. */}
          <ChipGroup<BoardNetwork>
            label="Network"
            value={network}
            options={BOARD_NETWORKS.map((value) => ({ value, label: chainLabel(escrowChainOf(value)) }))}
            href={(value) => leaderboardHref({ ...current, network: value }, { ...browse, page: 1 })}
          />
          <PeriodFact view={view} />
          <SearchForm current={current} browse={browse} />
        </div>
        {categoryOptions.length > 1 && (
          <ChipGroup<Classification | typeof ALL_CATEGORIES>
            label="Category"
            value={browse.category}
            options={categoryOptions}
            href={(value) => leaderboardHref(current, { search: browse.search, category: value, page: 1 })}
          />
        )}
      </section>

      {/*
        Only when it is a warning.
        
        "The same standings for every visitor" is a reassurance, and a
        paragraph of reassurance above the table costs every reader a
        screen to tell them nothing is wrong. Its opposite is a disclosure
        that weakens the figures, and that one keeps the position: a reader
        who would be misled has to meet it before the numbers, not after.
        Both texts stay on the page either way — the reassurance moves into
        the explanation under the table.
      */}
      {!SERVES_FROM_ONE_INSTANCE && (
        <div className="py-6">
          <Notice tone="watch" title="Standings may differ between visitors">
            {DIVERGENT_STANDINGS}
          </Notice>
        </div>
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
          <div className="border-b border-rule pb-4">
            <span className="t-label">Customer outcomes</span>
            <h2 id="outcomes-title" className="t-h2 mt-1">
              Settled on {chainLabel(escrowChainId)}, in {money.money ?? 'this escrow’s currency'}
            </h2>
            {outcomes.state === 'ready' && (
              <p className="mt-2 text-[13px] text-ink-2">
                <span className="font-medium text-ink">Ordered by:</span> {activeMetric.column}
              </p>
            )}
          </div>

          {outcomes.state === 'unavailable' ? (
            <EmptyState tone="bad" title={outcomes.reason}>
              Pokter could not read the job index or the registry for this board, so it is showing nothing rather than
              a zero. An empty board would claim no buyer has settled a job here, which this read does not establish.
              Try again shortly.
            </EmptyState>
          ) : (
            <>
              <div className="pt-5">
                <CoverageLine
                  items={[
                    {
                      label: 'Indexed jobs on this escrow',
                      value: formatCount(outcomes.data.coverage.indexedJobs),
                    },
                    {
                      label: 'Qualifying settled jobs',
                      value: formatCount(outcomes.data.coverage.qualifyingJobs),
                    },
                    {
                      label: 'Listed agents read',
                      value: formatCount(outcomes.data.coverage.listedAgents),
                    },
                    {
                      label: 'Index last refreshed',
                      value: timestamp(outcomes.data.coverage.lastRefreshedAt),
                    },
                  ]}
                />
              </div>

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
                <EmptyState title={NO_QUALIFYING_SETTLEMENTS} className="mt-6">
                  The query ran and matched nothing. Of the{' '}
                  {formatCount(outcomes.data.coverage.indexedJobs)} jobs indexed on this escrow,{' '}
                  {formatCount(outcomes.data.coverage.exclusions.teamFunded)} were funded by Pokter&rsquo;s own
                  wallets, {formatCount(outcomes.data.coverage.exclusions.selfHire)} were an operator paying their own
                  agent, {formatCount(outcomes.data.coverage.exclusions.lifecycleDemo)} were lifecycle
                  demonstrations, and {formatCount(outcomes.data.coverage.exclusions.unattributed)} name no ERC-8004
                  identity Pokter can attribute them to. This is a statement about Pokter&rsquo;s index on this
                  network, not about the chain.
                </EmptyState>
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
                    <OutcomeTable board={outcomes.data} page={outcomePage} current={current} browse={browse} />
                    <OutcomeCards board={outcomes.data} page={outcomePage} current={current} />
                  </div>
                  {outcomePage.pages > 1 && (
                    <div className="mt-4 flex justify-end">
                      <Pagination page={outcomePage} current={current} browse={browse} />
                    </div>
                  )}
                </>
              )}

              <Details
                className="mt-8 border-t border-rule pt-5"
                summary="How these figures are counted, and what they exclude"
              >
              <p className="max-w-3xl text-[13px] leading-relaxed text-ink-2">
                {activeMetric.definition}
              </p>
              <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-ink-2">
                Split by the escrow the money settled on, because that is what decides whether it was money. An
                agent&rsquo;s own registry chain is shown on its row and can differ.
              </p>
              <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-ink-2">{periodOf('outcomes').note}</p>
              {SERVES_FROM_ONE_INSTANCE && (
                <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-ink-2">{CONSISTENT_STANDINGS}</p>
              )}
              <ul className="mt-4 flex flex-col gap-2 text-[12.5px] leading-relaxed text-ink-2">
                <li>
                  Excluded from every figure above:{' '}
                  {formatCount(outcomes.data.coverage.exclusions.teamFunded)} job
                  {outcomes.data.coverage.exclusions.teamFunded === 1 ? '' : 's'} funded by Pokter&rsquo;s declared
                  wallets, {formatCount(outcomes.data.coverage.exclusions.selfHire)} self-hire
                  {outcomes.data.coverage.exclusions.selfHire === 1 ? '' : 's'},{' '}
                  {formatCount(outcomes.data.coverage.exclusions.lifecycleDemo)} lifecycle demonstration
                  {outcomes.data.coverage.exclusions.lifecycleDemo === 1 ? '' : 's'},{' '}
                  {formatCount(outcomes.data.coverage.exclusions.pokterCourier)} settled by Pokter&rsquo;s courier
                  rather than the agent, {formatCount(outcomes.data.coverage.exclusions.unknownSubmitter)} with no
                  recorded submitter, and {formatCount(outcomes.data.coverage.exclusions.unattributed)} naming no
                  ERC-8004 identity.
                </li>
                {/*
                  The verbs agree with the count, not only the noun.
                  "1 externally funded job ... have not been delivered" is what
                  the plural-only form rendered the first time one of these
                  stood alone, and a disclosure that reads as a slip is a
                  disclosure readers discount.
                */}
                {outcomes.data.coverage.exclusions.agentUndelivered > 0 && (
                  <li>
                    {formatCount(outcomes.data.coverage.exclusions.agentUndelivered)} externally funded job
                    {outcomes.data.coverage.exclusions.agentUndelivered === 1 ? '' : 's'} the escrow names an agent
                    as provider for {outcomes.data.coverage.exclusions.agentUndelivered === 1 ? 'has' : 'have'} not
                    been delivered. Not counted here either way; the agent pages carry{' '}
                    {outcomes.data.coverage.exclusions.agentUndelivered === 1 ? 'it' : 'them'}.
                  </li>
                )}
                {outcomes.data.platformOwed.length > 0 && (
                  <li className="text-watch">
                    {formatCount(outcomes.data.platformOwed.length)} externally funded job
                    {outcomes.data.platformOwed.length === 1 ? '' : 's'} on this escrow{' '}
                    {outcomes.data.platformOwed.length === 1 ? 'names' : 'name'} a Pokter wallet as provider and{' '}
                    {outcomes.data.platformOwed.length === 1 ? 'was' : 'were'} never delivered. Pokter owed{' '}
                    {outcomes.data.platformOwed.length === 1 ? 'that one' : 'those'}, not the agent, so{' '}
                    {outcomes.data.platformOwed.length === 1 ? 'it appears' : 'they appear'} on no agent&rsquo;s row.
                    <span className="mt-1 block">
                      <ReceiptLinks jobs={outcomes.data.platformOwed} label="Pokter-owed receipts" />
                    </span>
                  </li>
                )}
                {outcomes.data.coverage.unlistedAgentRows > 0 && (
                  <li>
                    {formatCount(outcomes.data.coverage.unlistedAgentRows)} row
                    {outcomes.data.coverage.unlistedAgentRows === 1 ? ' is' : 's are'} for an agent not in
                    Pokter&rsquo;s current listing. Their receipts are on chain, so the settlements are counted rather
                    than dropped.
                  </li>
                )}
                <li>
                  A settled job proves the escrow released to the provider. It does not prove the answer was correct,
                  useful, or profitable, and nothing on this board converts one into a return.
                </li>
              </ul>
              </Details>
            </>
          )}
        </section>
      )}

      {view === 'responsiveness' && responsiveness && (
        <section aria-labelledby="responsiveness-title">
          <div className="border-b border-rule pb-4">
            <span className="t-label">Responsiveness</span>
            <h2 id="responsiveness-title" className="t-h2 mt-1">
              {ANSWER_RATE_COLUMN}, on {chainLabel(registryChainOf(network))}
            </h2>
            {/*
              What the rate is not stays above the table, alone, while the
              rest of the explanation moves under it. The automatic reading
              of an answer rate is that it measures the answers, and a
              correction printed below the number it corrects is read after
              the reader has already taken the number at face value. The
              others describe the figure; this one stops it being
              misunderstood, so it is the one that keeps the position.
            */}
            <p className="mt-2 max-w-3xl text-[13.5px] font-medium leading-relaxed text-ink">
              {ANSWER_RATE_DOES_NOT_MEAN}
            </p>
          </div>

          {responsiveness.state === 'unavailable' ? (
            <EmptyState tone="bad" title={responsiveness.reason}>
              Pokter could not read the registry for this network, so it is showing nothing rather than a zero. An
              empty board would claim no agent answers, which this read does not establish. Try again shortly.
            </EmptyState>
          ) : (
            <>
              <div className="pt-5">
                <CoverageLine
                  items={[
                    {
                      label: 'Listed agents read',
                      value: formatCount(responsiveness.data.coverage.listedAgents),
                    },
                    {
                      label: `Checked in last ${RESPONSIVENESS_WINDOW_DAYS} days`,
                      value: `${formatCount(responsiveness.data.coverage.agentsWithChecks)} agents · ${formatCount(responsiveness.data.coverage.checksInWindow)} checks`,
                    },
                    {
                      label: `Ranked (≥ ${MIN_RESPONSIVENESS_CHECKS} checks)`,
                      value: formatCount(responsiveness.data.coverage.agentsRanked),
                    },
                    {
                      label: 'Last check recorded',
                      value: timestamp(responsiveness.data.coverage.lastCheckedAt),
                    },
                  ]}
                />
              </div>

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
              <Notice
                tone="watch"
                className="mt-4"
                title="The ranked rows are not all measured over the same period"
              >
                {observedSpanHeadline(responsiveness.data.coverage)}
              </Notice>

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

              <Details
                className="mt-8 border-t border-rule pt-5"
                summary="How this rate is measured, and what it does not cover"
              >
                <p className="max-w-3xl text-[13px] leading-relaxed text-ink-2">{ANSWER_RATE_MEANS}</p>
                <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-ink-2">
                  Split by the chain the agent is registered on, because a check calls the agent&rsquo;s own endpoint
                  and has no escrow in it. That is a different split from the outcomes board, and the two are not
                  comparable.
                </p>
                <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-ink-2">
                  {periodOf('responsiveness').note}
                </p>
                {SERVES_FROM_ONE_INSTANCE && (
                  <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-ink-2">{CONSISTENT_STANDINGS}</p>
                )}
                {observedSpanDetail(responsiveness.data.coverage) && (
                  <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-ink-2">
                    {observedSpanDetail(responsiveness.data.coverage)}
                  </p>
                )}
                <p className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-ink-2">
                  The check is a protocol handshake against the endpoint the agent&rsquo;s own card publishes, so the
                  declared protocol on each row is what Pokter spoke to it. A handshake is not a task: an agent can
                  answer every check and still be unable to do the work, which is what the outcomes board is for.
                </p>
              </Details>
            </>
          )}
        </section>
      )}

      <section className="mt-16 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <div className="rounded-[16px] border border-rule bg-raised p-6 text-[13.5px] leading-relaxed text-ink-2 sm:p-8">
          {/*
            One card under both boards, so it names both. It said "this
            board" and opened on settlements, which is a paragraph about the
            outcomes board printed under the responsiveness one — the same
            kind of mismatch as a column label that outlives its rule, and
            visible only by loading the page on the other view.

            Folded rather than dropped. These three refusals are the ones a
            reader is most likely to need and least likely to read, and the
            heading alone carries the warning for everyone who does not
            open it.
          */}
          <Details summary={<span className="t-h3 text-ink">What these boards refuse to claim</span>}>
          <p className="mt-1">
            A network with no qualifying row on the outcomes board means Pokter has indexed no external settlement
            there in this period. It is not a claim about what has happened on BNB Chain, about whether anyone has
            paid an agent, or about who was first to do anything. Pokter can only report what its own index holds,
            and the index depends on a hire being recorded as well as funded.
          </p>
          <p className="mt-3">
            Outside Pokter&rsquo;s team set is not the same as independent. Pokter cannot prove a buyer was unrelated
            or unsubsidised, so where a buyer runs a listed agent, or wrote an attestation about the agent it paid,
            the row says so instead of renaming the figure.
          </p>
          <p className="mt-3">
            Builders are deliberately not ranked here. Attributing historical jobs to the person who built an agent is
            not reliable enough yet, and a board nobody can check is worse than no board.
          </p>
          <Link href="/methodology" className="mt-4 inline-flex items-center gap-1 font-medium text-ink hover:underline">
            Read the methodology <Icon.Arrow size={14} />
          </Link>
          </Details>
        </div>
        <div className="flex flex-col gap-3 rounded-[16px] border border-[color-mix(in_oklab,var(--signal)_45%,transparent)] bg-signal-wash p-6 sm:p-8">
          <span className="t-label text-ink-2">Nothing here fits?</span>
          <h2 className="t-h3 text-ink">Have a task, not an agent?</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            Describe the work instead of picking a row. Agents answer with a signed price, and whatever you hire lands
            on this board under the same rules as everything above.
          </p>
          <Link href="/requests/new" className={cn(buttonClass('primary', 'm'), 'mt-1 self-start')}>
            Post a request <Icon.Plus size={15} />
          </Link>
        </div>
      </section>
    </div>
  );
}
