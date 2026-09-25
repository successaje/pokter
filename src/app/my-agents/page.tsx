import Link from 'next/link';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import { PrivateActivity } from '@/components/jobs/PrivateActivity';

/**
 * Activity cannot be keyed by a browser connection on the server without an
 * authenticated wallet session. Showing the process-wide SQLite tables here
 * would leak every demo user's task text and session metadata, so this page
 * is kept device-local and filtered by the connected passkey wallet.
 */
export default function MyAgentsPage() {
  const explorerBase = ALTANA_NETWORK.explorer.replace(/\/$/, '');
  return (
    <div className="flex flex-col gap-8 pt-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Your agents
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Sessions created by your passkey wallet and stored only on this
          device. Pokter never mixes this list with another visitor&apos;s activity.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4 border-b border-[color:var(--border)] pb-3">
          <h2 className="text-base font-medium tracking-tight">Private activity</h2>
          <p className="text-[11px] text-[color:var(--text-faint)]">
            Device-local · passkey-owned
          </p>
        </div>
        <PrivateActivity explorerBase={explorerBase} />
      </section>

      <p className="max-w-2xl text-[11px] leading-relaxed text-[color:var(--text-faint)]">
        Clearing browser storage removes this local index but does not change
        on-chain permissions or escrow. Keep transaction receipts as your durable record.{' '}
        <Link href="/agents" className="text-[color:var(--info)] underline decoration-dotted">
          Browse verified agents
        </Link>
        .
      </p>
    </div>
  );
}
