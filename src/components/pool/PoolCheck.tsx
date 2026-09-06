'use client';

import { useMemo, useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { computeCost } from '@/lib/pancakeswap/cost';
import type { ClientPool } from '@/lib/pancakeswap/pool';

const usd = (n: number) =>
  n >= 100 ? `$${n.toFixed(0)}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`;

const pct = (n: number) =>
  n >= 0.01 ? `${(n * 100).toFixed(2)}%` : `${(n * 100).toFixed(4)}%`;

/**
 * The LP-facing cost check.
 *
 * Everything on the left is a decision the LP makes; everything on the right is
 * computed from the pool as it stands right now. The output an LP should carry
 * away is the break-even, not the cost — a cost in isolation says nothing about
 * whether hiring is sensible.
 */
export function PoolCheck({ pools }: { pools: ClientPool[] }) {
  const [pairId, setPairId] = useState(pools[0]?.pairId);
  const [positionUsd, setPositionUsd] = useState(25_000);
  const [rebalancesPerMonth, setRebalances] = useState(8);
  const [turnover, setTurnover] = useState(0.25);

  const pool = pools.find((p) => p.pairId === pairId) ?? pools[0];

  const cost = useMemo(
    () =>
      computeCost({
        pool,
        positionUsd,
        rebalancesPerMonth,
        // Every agent in the registry that publishes a price charges this.
        agentFeeU: 0.1,
        turnoverPerRebalance: turnover,
      }),
    [pool, positionUsd, rebalancesPerMonth, turnover],
  );

  if (!pool) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
        <div className="flex flex-col gap-2">
          <span className="text-xs text-[color:var(--text-muted)]">Pool</span>
          <div className="flex flex-col gap-1.5">
            {pools.map((option) => (
              <button
                key={option.pairId}
                type="button"
                onClick={() => setPairId(option.pairId)}
                className={cn(
                  'flex items-center justify-between rounded-[var(--radius)] border px-3 py-2 text-left text-[12px] transition-colors',
                  option.pairId === pool.pairId
                    ? 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)]'
                    : 'border-[color:var(--border)] hover:border-[color:var(--border-strong)]',
                )}
              >
                <span>{option.label}</span>
                <span className="mono text-[10px] text-[color:var(--text-faint)]">
                  {(option.feeTier / 10_000).toFixed(2)}%
                </span>
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between text-xs text-[color:var(--text-muted)]">
            Position size
            <span className="tabular text-[13px] text-[color:var(--text)]">
              ${positionUsd.toLocaleString()}
            </span>
          </span>
          <input
            type="range"
            min={1000}
            max={500_000}
            step={1000}
            value={positionUsd}
            onChange={(e) => setPositionUsd(Number(e.target.value))}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between text-xs text-[color:var(--text-muted)]">
            Rebalances per month
            <span className="tabular text-[13px] text-[color:var(--text)]">
              {rebalancesPerMonth}
            </span>
          </span>
          <input
            type="range"
            min={1}
            max={60}
            step={1}
            value={rebalancesPerMonth}
            onChange={(e) => setRebalances(Number(e.target.value))}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between text-xs text-[color:var(--text-muted)]">
            Position swapped each time
            <span className="tabular text-[13px] text-[color:var(--text)]">
              {(turnover * 100).toFixed(0)}%
            </span>
          </span>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={turnover}
            onChange={(e) => setTurnover(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--bg-subtle)] p-5">
          <p className="text-[11px] uppercase tracking-widest text-[color:var(--text-muted)]">
            Break-even
          </p>
          <p className="tabular mt-2 text-3xl leading-none sm:text-4xl">
            {pct(cost.breakEvenApr)}
          </p>
          <p className="mt-2 max-w-lg text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
            The agent must improve your fee capture by at least this much, on an
            annualised basis, before hiring it leaves you better off. Below that,
            you are paying to lose money more efficiently.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--border)] sm:grid-cols-4">
          {[
            { label: 'Pool fees', value: usd(cost.swapFeesUsd), sub: 'per month' },
            { label: 'Price impact', value: usd(cost.priceImpactUsd), sub: 'per month' },
            { label: 'Gas', value: usd(cost.gasUsd), sub: 'per month' },
            {
              label: 'Agent fee',
              value: `${cost.agentFeesU.toFixed(1)} $U`,
              sub: 'per month',
            },
          ].map((cell) => (
            <div
              key={cell.label}
              className="flex flex-col gap-1 bg-[color:var(--surface)] p-4"
            >
              <dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                {cell.label}
              </dt>
              <dd className="tabular text-lg leading-none">{cell.value}</dd>
              <dd className="text-[10px] text-[color:var(--text-faint)]">{cell.sub}</dd>
            </div>
          ))}
        </dl>

        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
          <p className="text-[11px] font-medium">Read from the pool just now</p>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-[11px] sm:grid-cols-2">
            {[
              ['Pool', shortAddress(pool.address)],
              ['Fee tier', `${(pool.feeTier / 10_000).toFixed(2)}%`],
              ['Current tick', String(pool.tick)],
              ['Impact per rebalance', pct(cost.impactPerRebalance)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-[color:var(--text-muted)]">{k}</dt>
                <dd className="mono text-[color:var(--text)]">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {cost.beyondTickRange && (
          <p className="rounded-[var(--radius)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-3 text-[11px] leading-relaxed text-[color:var(--caution)]">
            At this size the swap would move beyond the liquidity sitting at the
            current tick, so the impact above is an <strong>underestimate</strong>.
            Crossing a tick usually moves into thinner liquidity. We flag it
            rather than quote a number we know is too low.
          </p>
        )}

        <p className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
          Costs are computed from live pool state. The benefit is not computed,
          because no agent publishes realised returns and nothing on-chain
          attributes fee capture to a rebalance decision — which is why this
          reports a break-even you can hold an agent to, rather than a projection
          you would have to believe.
        </p>
      </div>
    </div>
  );
}
