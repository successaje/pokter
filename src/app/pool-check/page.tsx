import Link from 'next/link';

import { PAIRS, readPool, toClientPool, type ClientPool } from '@/lib/pancakeswap/pool';
import { PoolCheck } from '@/components/pool/PoolCheck';
import { mapWithConcurrency } from '@/lib/concurrency';

/** Pool state is read per request; a cached liquidity figure would mislead. */
export const dynamic = 'force-dynamic';

export default async function PoolCheckPage() {
  const results = await mapWithConcurrency([...PAIRS], 3, async (pair) => {
    try {
      return toClientPool(await readPool(pair.id));
    } catch {
      // One unreachable pool should not take the page down; the others still
      // answer the question.
      return null;
    }
  });

  const pools = results.filter((p): p is ClientPool => p !== null);

  return (
    <div className="flex flex-col gap-10 pt-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          For PancakeSwap liquidity providers
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Will this agent pay for itself?
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Before you delegate a concentrated-liquidity position, work out what
          running an agent on it actually costs — priced against the pool as it
          stands right now, not a documented fee table.
        </p>
      </header>

      {pools.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-8 text-center text-xs text-[color:var(--text-faint)]">
          No pool could be read from BNB Chain right now. This page reads live
          state and does not fall back to cached numbers.
        </p>
      ) : (
        <PoolCheck pools={pools} />
      )}

      <section className="flex max-w-3xl flex-col gap-3 border-t border-[color:var(--border)] pt-6">
        <h2 className="text-sm font-medium">Why a break-even, and not a forecast</h2>
        <p className="text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
          Every other number Pokter shows about an agent is something it has
          measured. This one is arithmetic on live pool state, which is why it
          can be exact: the fee tier is published, and the price impact follows
          from the liquidity actually sitting at the current tick.
        </p>
        <p className="text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
          What no one can compute is the other side. No agent publishes realised
          returns, and nothing on-chain attributes fee capture to a rebalance
          decision — so a projected profit would be invented. A break-even is the
          honest form of the same question, and it converts into something you
          can actually hold an agent to after a month.
        </p>
        <p className="text-[11px] leading-relaxed text-[color:var(--text-faint)]">
          Pool state is read from BNB Chain mainnet. Agent pricing uses 0.1 $U
          per job, the price every agent in the registry that publishes one
          charges. Gas is estimated generously at $0.35 per rebalance. See{' '}
          <Link href="/methodology" className="underline underline-offset-2">
            methodology
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
