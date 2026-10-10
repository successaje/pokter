import type { Metadata } from 'next';
import Link from 'next/link';

import { mapWithConcurrency } from '@/lib/concurrency';
import { PAIRS, readPool, toClientPool, type ClientPool } from '@/lib/pancakeswap/pool';
import { PoolCheck } from '@/features/pool/PoolCheck';
import { EmptyState } from '@/ui/Feedback';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Will a rebalancing agent pay for itself?',
  description: 'For PancakeSwap v3 liquidity providers: the monthly cost of running an agent on a position, priced against live pool state, and the break-even it must beat.',
};

export default async function PoolCheckPage() {
  const results = await mapWithConcurrency([...PAIRS], 3, async (pair) => {
    try {
      return toClientPool(await readPool(pair.id));
    } catch {
      return null;
    }
  });
  const pools = results.filter((p): p is ClientPool => p !== null);

  return (
    <div className="frame pb-24 pt-10 sm:pt-14">
      <header className="mb-10 flex max-w-2xl flex-col gap-3">
        <span className="t-label flex items-center gap-2">
          <span className="tile" aria-hidden /> For PancakeSwap liquidity providers
        </span>
        <h1 className="t-h1">Will a rebalancing agent pay for itself?</h1>
        <p className="t-lede">Before you hand a concentrated-liquidity position to an agent, see what running it costs, priced against the pool as it stands right now.</p>
      </header>
      {pools.length === 0 ? (
        <EmptyState tone="bad" title="No pool could be read from BNB Chain right now">
          This page reads live state and never falls back to cached numbers. Try again in a moment.
        </EmptyState>
      ) : (
        <PoolCheck pools={pools} />
      )}
      <section className="mt-14 flex max-w-3xl flex-col gap-3 border-t border-rule pt-8 text-[14.5px] leading-relaxed text-ink-2">
        <h2 className="t-h3 text-ink">Why a break-even, and not a forecast</h2>
        <p>The cost side is arithmetic on live pool state: the fee tier is published, and price impact follows from the liquidity at the current tick. The benefit side is not computable: no agent publishes realised returns, and nothing on chain attributes fee capture to a rebalance decision. A break-even is the honest form of the question.</p>
        <p>
          Then compare <Link href="/discover?category=rebalancing" className="link">rebalancing agents</Link> on what has actually been measured.
        </p>
      </section>
    </div>
  );
}
