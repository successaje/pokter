import type { Metadata } from 'next';
import Link from 'next/link';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { escrowCommerceAddress } from '@/lib/erc8183/addresses';
import type { HiredJob } from '@/lib/erc8183/types';
import { jobReceipt } from '@/lib/jobs/receipt-link';
import {
  CONSISTENT_STANDINGS,
  DIVERGENT_STANDINGS,
  SERVES_FROM_ONE_INSTANCE,
} from '@/lib/leaderboard/consistency';
import {
  BOARD_NETWORKS,
  boardNetworkFrom,
  escrowChainOf,
  NO_QUALIFYING_SETTLEMENTS,
  registryChainOf,
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
  type OutcomeBoard,
  type OutcomeRow,
} from '@/lib/leaderboard/outcomes';
import {
  ANSWER_RATE_COLUMN,
  ANSWER_RATE_DOES_NOT_MEAN,
  ANSWER_RATE_MEANS,
  MIN_RESPONSIVENESS_CHECKS,
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

function FilterGroup<T extends string>({
  label,
  value,
  options,
  href,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  href: (value: T) => string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="t-label">{label}</legend>
      <div className="flex flex-wrap gap-1 rounded-[10px] bg-sunken p-1">
        {options.map((option) => (
          <Link
            key={option.value}
            href={href(option.value)}
            scroll={false}
            aria-current={value === option.value ? 'true' : undefined}
            className={cn(
              'rounded-[7px] px-3 py-1.5 text-[13px] transition-colors',
              value === option.value ? 'bg-raised font-medium text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </fieldset>
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
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
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

function OutcomeTable({
  board,
  current,
}: {
  board: OutcomeBoard;
  current: BoardSelection;
}) {
  const active = OUTCOME_METRIC_BY_ID.get(board.metric)!;
  return (
    <div className="mt-6 overflow-x-auto rounded-[14px] border border-rule">
      <table className="w-full min-w-[880px] text-left text-[13px]">
        <caption className="sr-only">
          Agents on {chainLabel(board.escrowChainId)}, ordered by {active.column}, highest first.
        </caption>
        <thead className="bg-sunken/70">
          <tr>
            <th scope="col" className="t-label px-4 py-3 font-medium">
              #
            </th>
            <th scope="col" className="t-label px-4 py-3 font-medium">
              Agent
            </th>
            {OUTCOME_METRICS.map((metric) => (
              <th
                key={metric.id}
                scope="col"
                aria-sort={metric.id === board.metric ? 'descending' : 'none'}
                className={cn(
                  't-label px-4 py-3 text-right font-medium',
                  metric.id === board.metric && 'bg-signal-wash text-ink',
                )}
              >
                <Link href={leaderboardHref({ ...current, metric: metric.id })} scroll={false} className="hover:underline">
                  {metric.column}
                </Link>
                {metric.id === board.metric && <span className="sr-only"> (ordering this table)</span>}
              </th>
            ))}
            <th scope="col" className="t-label px-4 py-3 text-right font-medium">
              Delivered, escrow not released
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule bg-raised">
          {board.rows.map((row, index) => (
            <OutcomeTableRow key={row.agent.key} row={row} rank={index + 1} current={current} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutcomeTableRow({
  row,
  rank,
  current,
}: {
  row: OutcomeRow;
  rank: number;
  current: BoardSelection;
}) {
  const money = escrowMoney(escrowChainOf(current.network));
  return (
    <tr>
      <td className="t-readout px-4 py-4 align-top text-ink-3">
        {row.settledJobs > 0 ? String(rank).padStart(2, '0') : '—'}
      </td>
      <th scope="row" className="px-4 py-4 align-top font-medium">
        <span className="flex items-start gap-3">
          <AgentAvatar name={row.agent.name} imageUrl={row.agent.imageUrl} seed={row.agent.key} size={36} />
          <span className="min-w-0">
            {row.listed ? (
              <Link href={`/agents/${row.agent.chainId}/${row.agent.tokenId}`} className="hover:underline">
                {row.agent.name}
              </Link>
            ) : (
              <span>{row.agent.name}</span>
            )}
            <span className="mt-0.5 block text-[11.5px] font-normal text-ink-3">
              Registered on {chainLabel(row.agent.chainId)} &middot; paid in{' '}
              {money.money ?? 'this escrow’s currency'}
            </span>
            {!row.listed && (
              <span className="mt-0.5 block text-[11.5px] font-normal text-watch">
                Not in Pokter&rsquo;s current listing; its receipts are still on chain.
              </span>
            )}
            {/*
              Two courier shapes, said apart, because they settle identically
              on the escrow and mean opposite things about the agent. One
              carries the agent's own answer and one carries nothing of the
              agent's at all, and a reader has to be able to tell "Pokter
              carried this agent's answer" from "Pokter did the work".
              Neither counts towards the column above.
            */}
            {row.relayedSettled > 0 && (
              <span className="mt-1 block text-[11.5px] font-normal text-ink-2">
                {formatCount(row.relayedSettled)} further settled job
                {row.relayedSettled === 1 ? '' : 's'} submitted by Pokter&rsquo;s courier carrying this
                agent&rsquo;s own answer. The answer was the agent&rsquo;s; the delivery was not. Not counted
                above.
                <ReceiptLinks jobs={row.relayed} label="Relayed-answer receipts" />
              </span>
            )}
            {row.courierSettled > 0 && (
              <span className="mt-1 block text-[11.5px] font-normal text-watch">
                {formatCount(row.courierSettled)} further settled job
                {row.courierSettled === 1 ? '' : 's'} delivered by Pokter&rsquo;s courier, with no answer of this
                agent&rsquo;s in it. Not counted above.
                <ReceiptLinks jobs={row.courier} label="Courier-delivered receipts" />
              </span>
            )}
            {row.operatorBuyers > 0 && (
              <span className="mt-1 block text-[11.5px] font-normal text-ink-2">
                {formatCount(row.operatorBuyers)} of {formatCount(row.externalBuyers)} buyer wallet
                {row.externalBuyers === 1 ? '' : 's'} here own a listed agent. Outside Pokter&rsquo;s team set, and
                not independent of the marketplace.
              </span>
            )}
            {row.reviewerBuyers === null ? (
              <span className="mt-1 block text-[11.5px] font-normal text-ink-3">
                Attestation authors not read, so overlap with these buyers is unknown.
              </span>
            ) : (
              row.reviewerBuyers > 0 && (
                <span className="mt-1 block text-[11.5px] font-normal text-watch">
                  {formatCount(row.reviewerBuyers)} of these buyer wallets also wrote an on-chain attestation about
                  this agent: buyer and reviewer are the same party.
                </span>
              )
            )}
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-normal">
              <Link
                href={`/proof?network=${current.network}&funder=outside-team&agent=${row.agent.key}`}
                className="text-ink-2 hover:underline"
              >
                Every job
              </Link>
              <Link
                href={leaderboardCardHref({
                  network: current.network,
                  metric: current.metric,
                  chainId: row.agent.chainId,
                  tokenId: row.agent.tokenId,
                })}
                className="inline-flex items-center gap-1 text-ink-2 hover:underline"
              >
                <Icon.Share size={12} /> Share card
              </Link>
            </span>
          </span>
        </span>
      </th>
      <td
        className={cn(
          't-readout px-4 py-4 text-right align-top',
          current.metric === 'settled-jobs' && 'bg-signal-wash font-medium',
        )}
      >
        {formatCount(row.settledJobs)}
        <ReceiptLinks jobs={row.settled} label="Settled receipts" />
      </td>
      <td
        className={cn(
          't-readout px-4 py-4 text-right align-top',
          current.metric === 'external-buyers' && 'bg-signal-wash font-medium',
        )}
      >
        {formatCount(row.externalBuyers)}
      </td>
      <td
        className={cn(
          't-readout px-4 py-4 text-right align-top',
          current.metric === 'repeat-buyers' && 'bg-signal-wash font-medium',
        )}
      >
        {formatCount(row.repeatBuyers)}
      </td>
      <td className="t-readout px-4 py-4 text-right align-top text-ink-2">
        {formatCount(row.deliveredUnsettled)}
        <ReceiptLinks jobs={row.delivered} label="Delivered, unsettled receipts" />
      </td>
    </tr>
  );
}

function ResponsivenessCategory({ entry }: { entry: CategoryResponsiveness }) {
  const category = CATEGORY_BY_ID.get(entry.category)!;
  if (entry.ranked.length === 0 && entry.belowMinimum.length === 0) return null;
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
      {entry.ranked.length === 0 ? (
        <p className="border-b border-rule bg-sunken/50 px-4 py-3 text-[13px] text-ink-2">
          No agent in this category has {MIN_RESPONSIVENESS_CHECKS} checks in the last {RESPONSIVENESS_WINDOW_DAYS}{' '}
          days, so Pokter publishes no order for it. Every listed agent in this category is below, with whatever
          checks Pokter has for it — which for some is none.
        </p>
      ) : (
        <ol className="divide-y divide-rule">
          {entry.ranked.map((row, index) => (
            <ResponsivenessLine key={row.agent.key} row={row} rank={index + 1} />
          ))}
        </ol>
      )}
      {entry.belowMinimum.length > 0 && (
        <details className="mt-3 rounded-[12px] border border-rule bg-sunken/40 px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-medium">
            {formatCount(entry.belowMinimum.length)} agent{entry.belowMinimum.length === 1 ? '' : 's'} with too few
            checks to rank
          </summary>
          <p className="mt-2 text-[12.5px] text-ink-2">
            Listed with their figures and left unordered. A rate out of a handful of attempts is not a low rate, it is
            no measurement.
          </p>
          <ol className="mt-2 divide-y divide-rule">
            {entry.belowMinimum.map((row) => (
              <ResponsivenessLine key={row.agent.key} row={row} rank={null} />
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function ResponsivenessLine({ row, rank }: { row: ResponsivenessRow; rank: number | null }) {
  return (
    <li className="grid gap-2 py-3.5 sm:grid-cols-[2.5rem_minmax(0,1fr)_7rem_9rem] sm:items-center">
      <span className="t-readout text-[13px] text-ink-3">{rank === null ? '—' : String(rank).padStart(2, '0')}</span>
      <span className="flex min-w-0 items-center gap-3">
        <AgentAvatar name={row.agent.name} imageUrl={row.agent.imageUrl} seed={row.agent.key} size={32} />
        <span className="min-w-0">
          <Link
            href={`/agents/${row.agent.chainId}/${row.agent.tokenId}`}
            className="block truncate text-[14px] font-medium hover:underline"
          >
            {row.agent.name}
          </Link>
          <span className="mt-0.5 block text-[11.5px] text-ink-3">
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
      <span className="t-readout col-start-2 text-[12px] text-ink-3 sm:col-start-auto sm:text-right">
        {row.checks === 0
          ? 'No check in this window'
          : `${formatCount(row.answered)} of ${formatCount(row.checks)} checks`}
      </span>
    </li>
  );
}

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

  const [outcomes, responsiveness] = await Promise.all([
    view === 'outcomes' ? loadOutcomeBoard(network, metric) : Promise.resolve(null),
    view === 'responsiveness' ? loadResponsivenessBoard(network) : Promise.resolve(null),
  ]);

  const escrowChainId = escrowChainOf(network);
  const money = escrowMoney(escrowChainId);
  const activeMetric = OUTCOME_METRIC_BY_ID.get(metric)!;

  return (
    <div className="frame pb-24 pt-10 sm:pt-16">
      <header className="grid gap-8 border-b border-rule pb-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)] lg:items-end">
        <div className="flex max-w-3xl flex-col gap-4">
          <span className="t-label flex items-center gap-2">
            <span className="tile" aria-hidden /> Leaderboard
          </span>
          <h1 className="t-display">{TITLE}</h1>
          <p className="t-lede max-w-2xl">
            Two boards, never blended. One counts escrow jobs that external buyers settled with evidence the agent did
            the work. The other counts whether an agent answered Pokter&rsquo;s scheduled check. Each is sorted by one
            named metric at a time, and every figure links to the receipt behind it.
          </p>
        </div>
        <div className="rounded-[14px] border border-rule bg-raised p-5 text-[13px] leading-relaxed text-ink-2">
          <p className="font-medium text-ink">There is no overall score</p>
          <p className="mt-2">
            Nothing here is combined into a single rank. The column you sorted by is the whole explanation of the
            order, and a tie on it breaks alphabetically rather than on a second metric.
          </p>
        </div>
      </header>

      <section aria-label="Board" className="grid gap-5 border-b border-rule py-6 md:grid-cols-2">
        <FilterGroup<BoardNetwork>
          label="Network (separate boards, never merged)"
          value={network}
          options={BOARD_NETWORKS.map((value) => ({ value, label: chainLabel(escrowChainOf(value)) }))}
          href={(value) => leaderboardHref({ ...current, network: value })}
        />
        <FilterGroup<BoardView>
          label="What is measured"
          value={view}
          options={[
            { value: 'outcomes', label: 'Customer outcomes' },
            { value: 'responsiveness', label: 'Responsiveness' },
          ]}
          href={(value) => leaderboardHref({ ...current, view: value })}
        />
      </section>

      <div className="py-6">
        <Notice
          tone={SERVES_FROM_ONE_INSTANCE ? 'neutral' : 'watch'}
          title={
            SERVES_FROM_ONE_INSTANCE
              ? 'The same standings for every visitor'
              : 'Standings may differ between visitors'
          }
        >
          {SERVES_FROM_ONE_INSTANCE ? CONSISTENT_STANDINGS : DIVERGENT_STANDINGS}
        </Notice>
      </div>

      {view === 'outcomes' && outcomes && (
        <section aria-labelledby="outcomes-title">
          <div className="border-b border-rule pb-4">
            <span className="t-label">Customer outcomes</span>
            <h2 id="outcomes-title" className="t-h2 mt-1">
              Settled on {chainLabel(escrowChainId)}, in {money.money ?? 'this escrow’s currency'}
            </h2>
            <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
              Split by the escrow the money settled on, because that is what decides whether it was money. An
              agent&rsquo;s own registry chain is shown on its row and can differ.
            </p>
            {outcomes.state === 'ready' && (
              <p className="mt-3 text-[13px] text-ink-2">
                <span className="font-medium text-ink">Ordered by:</span> {activeMetric.column}. {activeMetric.definition}
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
              ) : (
                <OutcomeTable board={outcomes.data} current={current} />
              )}

              <ul className="mt-6 flex flex-col gap-2 text-[12.5px] leading-relaxed text-ink-2">
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
                {outcomes.data.coverage.exclusions.agentUndelivered > 0 && (
                  <li>
                    {formatCount(outcomes.data.coverage.exclusions.agentUndelivered)} externally funded job
                    {outcomes.data.coverage.exclusions.agentUndelivered === 1 ? '' : 's'} the escrow names an agent
                    as provider for have not been delivered. Not counted here either way; the agent pages carry them.
                  </li>
                )}
                {outcomes.data.platformOwed.length > 0 && (
                  <li className="text-watch">
                    {formatCount(outcomes.data.platformOwed.length)} externally funded job
                    {outcomes.data.platformOwed.length === 1 ? '' : 's'} on this escrow name a Pokter wallet as
                    provider and were never delivered. Pokter owed those, not the agent, so they appear on no
                    agent&rsquo;s row.
                    <ReceiptLinks jobs={outcomes.data.platformOwed} label="Pokter-owed receipts" />
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
            <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">{ANSWER_RATE_MEANS}</p>
            <p className="mt-2 max-w-3xl text-[13.5px] font-medium leading-relaxed text-ink">
              {ANSWER_RATE_DOES_NOT_MEAN}
            </p>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-2">
              Split by the chain the agent is registered on, because a check calls the agent&rsquo;s own endpoint and
              has no escrow in it. That is a different split from the outcomes board above, and the two are not
              comparable.
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
                    <ResponsivenessCategory key={entry.category} entry={entry} />
                  ))}
                </div>
              )}

              <p className="mt-8 text-[12.5px] leading-relaxed text-ink-2">
                The check is a protocol handshake against the endpoint the agent&rsquo;s own card publishes, so the
                declared protocol on each row is what Pokter spoke to it. A handshake is not a task: an agent can
                answer every check and still be unable to do the work, which is what the outcomes board is for.
              </p>
            </>
          )}
        </section>
      )}

      <section className="mt-16 rounded-[16px] border border-rule bg-raised p-6 text-[13.5px] leading-relaxed text-ink-2 sm:p-8">
        <h2 className="t-h3 text-ink">What this board refuses to claim</h2>
        <p className="mt-3">
          A network with no qualifying row means Pokter has indexed no external settlement there in this period. It is
          not a claim about what has happened on BNB Chain, about whether anyone has paid an agent, or about who was
          first to do anything. Pokter can only report what its own index holds, and the index depends on a hire being
          recorded as well as funded.
        </p>
        <p className="mt-3">
          Outside Pokter&rsquo;s team set is not the same as independent. Pokter cannot prove a buyer was unrelated or
          unsubsidised, so where a buyer runs a listed agent, or wrote an attestation about the agent it paid, the row
          says so instead of renaming the figure.
        </p>
        <p className="mt-3">
          Builders are deliberately not ranked here. Attributing historical jobs to the person who built an agent is
          not reliable enough yet, and a board nobody can check is worse than no board.
        </p>
        <Link href="/methodology" className="mt-4 inline-flex items-center gap-1 font-medium text-ink hover:underline">
          Read the methodology <Icon.Arrow size={14} />
        </Link>
      </section>
    </div>
  );
}
