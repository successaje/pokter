'use client';

import { useMemo, useState } from 'react';

import { computeCost } from '@/lib/pancakeswap/cost';
import type { ClientPool } from '@/lib/pancakeswap/pool';
import { cn } from '@/lib/ui/cn';
import { Address } from '@/ui/Data';
import { Notice } from '@/ui/Feedback';

const usd = (n: number) => (n >= 100 ? `$${n.toFixed(0)}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`);
const pct = (n: number) => (n >= 0.01 ? `${(n * 100).toFixed(2)}%` : `${(n * 100).toFixed(4)}%`);

function Slider({ label, value, display, min, max, step, onChange }: { label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between text-[13px] text-ink-2">
        {label}
        <span className="t-readout text-[14px] text-ink">{display}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--ink)]" />
    </label>
  );
}

/**
 * What running a rebalancing agent on a PancakeSwap v3 position costs per
 * month, priced against the pool's live state, and the fee-capture
 * improvement the agent must deliver to break even. The benefit side is
 * deliberately not estimated: nothing on chain attributes it to an agent.
 */
export function PoolCheck({ pools }: { pools: ClientPool[] }) {
  const [pairId, setPairId] = useState(pools[0]?.pairId);
  const [positionUsd, setPositionUsd] = useState(25_000);
  const [rebalances, setRebalances] = useState(8);
  const [turnover, setTurnover] = useState(0.25);
  const [agentFeeU, setAgentFeeU] = useState(0.1);
  const pool = pools.find((p) => p.pairId === pairId) ?? pools[0];
  const cost = useMemo(
    () => (pool ? computeCost({ pool, positionUsd, rebalancesPerMonth: rebalances, agentFeeU, turnoverPerRebalance: turnover }) : null),
    [pool, positionUsd, rebalances, turnover, agentFeeU],
  );
  if (!pool || !cost) return null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6 rounded-[16px] border border-rule bg-raised p-5">
        <div role="radiogroup" aria-label="Pool" className="flex flex-col gap-1.5">
          <span className="t-label mb-1">Pool</span>
          {pools.map((p) => (
            <button
              key={p.pairId}
              type="button"
              role="radio"
              aria-checked={p.pairId === pool.pairId}
              onClick={() => setPairId(p.pairId)}
              className={cn('flex items-center justify-between rounded-[9px] border px-3 py-2 text-left text-sm', p.pairId === pool.pairId ? 'border-ink bg-paper' : 'border-rule hover:border-rule-strong')}
            >
              {p.label}
              <span className="t-readout text-[12px] text-ink-3">{(p.feeTier / 10_000).toFixed(2)}% fee</span>
            </button>
          ))}
        </div>
        <Slider label="Position size" value={positionUsd} display={`$${positionUsd.toLocaleString('en-US')}`} min={1000} max={500_000} step={1000} onChange={setPositionUsd} />
        <Slider label="Rebalances per month" value={rebalances} display={String(rebalances)} min={1} max={60} step={1} onChange={setRebalances} />
        <Slider label="Share of position swapped each time" value={turnover} display={pct(turnover)} min={0.05} max={1} step={0.05} onChange={setTurnover} />
        <Slider label="Agent’s price per job" value={agentFeeU} display={`${agentFeeU.toFixed(2)} $U`} min={0} max={2} step={0.01} onChange={setAgentFeeU} />
        <p className="text-[12px] text-ink-3">Use the agent&rsquo;s signed price from its profile. Pokter does not assume one.</p>
      </div>

      <div className="flex flex-col gap-5">
        <div className="rounded-[16px] border-2 border-ink bg-raised p-6">
          <span className="t-label">The agent must improve your fee capture by</span>
          <p className="t-readout mt-2 text-[2.6rem] leading-none tracking-[-0.03em]">{pct(cost.breakEvenApr)}</p>
          <p className="mt-2 text-sm text-ink-2">a year, on this position, just to cover what running it costs. Hold it to that number after a month.</p>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-rule bg-rule sm:grid-cols-4">
          {[
            ['Pool fees', usd(cost.swapFeesUsd)],
            ['Price impact', usd(cost.priceImpactUsd)],
            ['Gas', usd(cost.gasUsd)],
            ['Agent fees', `${cost.agentFeesU.toFixed(2)} $U`],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1 bg-raised p-4">
              <dt className="t-label">{k}</dt>
              <dd className="t-readout text-lg">{v}</dd>
              <dd className="text-[12px] text-ink-3">per month</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-ink-3">
          <span>Impact per rebalance: <span className="t-readout text-ink-2">{pct(cost.impactPerRebalance)}</span></span>
          <span>Pool read {new Date(pool.readAt).toLocaleTimeString()}</span>
          <Address address={pool.address} />
        </div>
        {cost.beyondTickRange && (
          <Notice tone="watch" title="This trade moves past the current tick">
            The impact estimate uses only liquidity at the current tick, so for a trade this large it understates the real cost.
          </Notice>
        )}
      </div>
    </div>
  );
}
