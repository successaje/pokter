import type { Metadata } from 'next';
import { isAddress } from 'viem';

import { TradingWatchPanel } from '@/features/trading/TradingWatchPanel';
import { DELEGATED_TRADERS } from '@/lib/trading/agents';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Watch a trading wallet',
  description: 'For agents that trade from your own wallet under on-chain limits: Pokter checks that every token leaving the wallet comes back, read from BNB Chain.',
  alternates: { canonical: '/trading' },
  robots: { index: false },
};

export default async function TradingPage({ searchParams }: { searchParams: Promise<{ wallet?: string; agent?: string }> }) {
  const sp = await searchParams;
  const agentKey = sp.agent && sp.agent in DELEGATED_TRADERS ? sp.agent : null;
  const trader = agentKey ? DELEGATED_TRADERS[agentKey] : null;
  const wallet = sp.wallet && isAddress(sp.wallet) ? sp.wallet : null;

  return (
    <div className="frame max-w-6xl pb-24 pt-10 sm:pt-14">
      <header className="flex max-w-3xl flex-col gap-3">
        <span className="t-label flex items-center gap-2">
          <span className="tile" aria-hidden /> Pilot · BNB Chain
        </span>
        <h1 className="t-h1">{trader ? `Watch your ${trader.operator} ${trader.product} wallet` : 'Watch a trading wallet'}</h1>
        <p className="t-lede">
          An agent that trades from your wallet is limited in how much it can spend and which contracts it can call, not in where a swap’s output goes. Pokter checks that part for you: every token that leaves the wallet has to come back in the same transaction.
        </p>
      </header>
      <div className="mt-8">
        <TradingWatchPanel initialWallet={wallet} agentKey={agentKey} trader={trader} />
      </div>
    </div>
  );
}
