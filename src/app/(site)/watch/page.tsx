import type { Metadata } from 'next';
import { isAddress } from 'viem';

import { LoanWatchPanel } from '@/features/loan-watch/LoanWatchPanel';
import { loanWatchReliability } from '@/lib/notifications/server';
import { shareMetadata } from '@/lib/og/share';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Venus liquidation alerts',
  description: 'Free email alerts before a Venus Core Pool loan on BNB Chain is liquidated. Check any position now, choose a threshold, and see how reliable the alerts have been.',
  alternates: { canonical: '/watch' },
  ...shareMetadata({
    title: 'Free Venus liquidation alerts',
    description: 'Check a Venus position’s health factor and get an email before it can be liquidated.',
  }),
};

/** Brinkwatch, Pokter's own health-factor agent, for the full report with a repay amount. */
const BRINKWATCH_HIRE = '/hire/56/374107';

function ago(iso: string | null, now: number): string {
  if (!iso) return 'not yet';
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

export default async function WatchPage({ searchParams }: { searchParams: Promise<{ wallet?: string; email?: string }> }) {
  const sp = await searchParams;
  const now = renderedAt();
  const reliability = loanWatchReliability(now);
  const wallet = sp.wallet && isAddress(sp.wallet) ? sp.wallet : null;
  const reads = reliability.readOk + reliability.readFailed;
  const okShare = reads > 0 ? Math.round((reliability.readOk / reads) * 1000) / 10 : null;

  return (
    <div className="frame max-w-5xl pb-24 pt-10 sm:pt-14">
      <header className="flex max-w-3xl flex-col gap-3">
        <span className="t-label flex items-center gap-2">
          <span className="tile" aria-hidden /> Free · Venus Core Pool · BNB Chain
        </span>
        <h1 className="t-h1">Know before your Venus loan is liquidated</h1>
        <p className="t-lede">Check any position&rsquo;s health factor now, and get an email when it falls below a level you choose. No wallet to connect, nothing to sign.</p>
      </header>

      {sp.email === 'verified' && (
        <div className="mt-6 max-w-3xl">
          <Notice tone="ok" title="Alerts are on">
            Pokter is watching the position. Each alert has a link to stop it.
          </Notice>
        </div>
      )}
      {sp.email === 'unsubscribed' && (
        <div className="mt-6 max-w-3xl">
          <Notice title="Alerts are off">You will not hear about that position again.</Notice>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <LoanWatchPanel initialWallet={wallet} hireHref={BRINKWATCH_HIRE} />

        <aside aria-labelledby="reliability-title" className="flex flex-col gap-4 rounded-[18px] border border-rule p-5 lg:sticky lg:top-24">
          <h2 id="reliability-title" className="text-[16px] font-semibold">
            How reliable this is
          </h2>
          <dl className="ruled text-[13.5px]">
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-ink-2">Last check run</dt>
              <dd className="t-readout">{ago(reliability.lastRunAt, now)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-ink-2">Reads, past 24 hours</dt>
              <dd className="t-readout">{reads === 0 ? 'None yet' : `${reliability.readOk} of ${reads}${okShare !== null ? ` · ${okShare}%` : ''}`}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-ink-2">Positions watched</dt>
              <dd className="t-readout">{reliability.watching}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-ink-2">Alerts sent, past 24 hours</dt>
              <dd className="t-readout">{reliability.alerts}</dd>
            </div>
          </dl>
          <ul className="flex flex-col gap-2 text-[12.5px] leading-snug text-ink-3">
            <li className="flex gap-2">
              <Icon.Clock size={13} className="mt-0.5 shrink-0" aria-hidden /> Positions are read about every ten minutes, so a sharp move can liquidate between checks.
            </li>
            <li className="flex gap-2">
              <Icon.Alert size={13} className="mt-0.5 shrink-0" aria-hidden /> If Pokter cannot read a position for two hours, it tells you once rather than staying silent.
            </li>
            <li className="flex gap-2">
              <Icon.Shield size={13} className="mt-0.5 shrink-0" aria-hidden /> Email can be delayed by your provider. Use this as a second pair of eyes, not the only one.
            </li>
          </ul>
          <p className="text-[11.5px] text-ink-3">
            The health factor is Venus&rsquo;s own: weighted collateral over debt, from <span className="t-readout">getAccountLiquidity</span> and the Venus oracle. Isolated pools are not covered.
          </p>
        </aside>
      </div>
    </div>
  );
}

/** When this request rendered: one clock for the page's "min ago" figures. */
function renderedAt(): number {
  return Date.now();
}
