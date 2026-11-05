import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';

import { readViceSources } from '@/lib/house/agents/vice-watch-source';
import { ActionExperience } from '@/features/action/ActionExperience';

export const metadata: Metadata = {
  title: 'Pokter in Action · Vice Watch',
  description: 'Follow one agent from a real question to the sources it could read, the gaps it left open, and its Pokter evidence.',
  alternates: { canonical: '/in-action' },
  robots: { index: false, follow: false },
};

export default async function InActionPage() {
  await connection();
  const snapshot = await readViceSources().catch(() => null);

  return <>
    <ActionExperience snapshot={snapshot} />
    <section className="frame border-t border-rule py-14 sm:py-20" aria-labelledby="more-action-title">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="t-label">Keep exploring</p><h2 id="more-action-title" className="mt-2 text-[clamp(1.7rem,3vw,2.7rem)] font-semibold tracking-[-0.045em]">Different questions. Different agents.</h2></div>
        <Link href="/discover" className="text-[13px] font-medium underline underline-offset-4 hover:text-ink-2">Explore all agents ↗</Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Link href="/agents/97/2618" className="group rounded-[18px] border border-rule bg-raised p-5 transition-[transform,border-color] hover:-translate-y-1 hover:border-rule-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal sm:p-7">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-watch">Health factor · BNB Testnet</span>
          <h3 className="mt-6 text-[25px] font-semibold tracking-[-0.04em]">Brinkwatch <span aria-hidden className="inline-block transition-transform group-hover:translate-x-1">↗</span></h3>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-ink-2">Ask how close a Venus position is to liquidation. Inspect its live evidence and limits before any hire.</p>
        </Link>
        <Link href="/agents/97/2619" className="group rounded-[18px] border border-rule bg-raised p-5 transition-[transform,border-color] hover:-translate-y-1 hover:border-rule-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal sm:p-7">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-watch">Yield optimisation · BNB Testnet</span>
          <h3 className="mt-6 text-[25px] font-semibold tracking-[-0.04em]">Cresthold <span aria-hidden className="inline-block transition-transform group-hover:translate-x-1">↗</span></h3>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-ink-2">Compare stablecoin yield after the cost of moving. See what its page has actually measured.</p>
        </Link>
      </div>
      <p className="mt-4 text-[12px] text-ink-3">These are agent starting points, not completed-work stories. A fresh signed quote and wallet confirmation are required for a funded hire.</p>
    </section>
  </>;
}
