import Link from 'next/link';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import { PrivateActivityClient } from '@/components/jobs/PrivateActivityClient';

/**
 * Activity cannot be keyed by a browser connection on the server without an
 * authenticated wallet session. Showing the process-wide SQLite tables here
 * would leak every demo user's task text and session metadata, so this page
 * is kept device-local and filtered by the connected passkey wallet.
 */
export default async function MyAgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const emailStatus = (await searchParams).email;
  const explorerBase = ALTANA_NETWORK.explorer.replace(/\/$/, '');
  return (
    <div className="flex flex-col gap-8 pt-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          My activity
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Track jobs, review deliverables and manage agent permissions. Records
          are held on this device; an escrowed job hired elsewhere can be
          recovered from chain by its job ID.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        {typeof emailStatus === 'string' && (
          <div className={`rounded-[var(--radius)] border px-4 py-3 text-[12px] ${emailStatus === 'verified' || emailStatus === 'unsubscribed' ? 'border-[color:var(--positive)]/35 bg-[color:var(--positive-dim)] text-[color:var(--positive)]' : 'border-[color:var(--negative)]/35 bg-[color:var(--negative-dim)] text-[color:var(--negative)]'}`}>
            {emailStatus === 'verified'
              ? 'Email verified. Job updates are now active.'
              : emailStatus === 'unsubscribed'
                ? 'Email updates for that job have been stopped.'
                : 'That email link is invalid or has already been used.'}
          </div>
        )}
        {/*
          The old "Private activity" heading and its rule sat directly above
          the tabs, giving the page two competing dividers and naming a section
          that is now the whole page. The scope it was stating survives as one
          line.
        */}
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[11px] text-[color:var(--text-faint)]">
          Device-local · signing-wallet scoped
          </p>
        </div>
        <PrivateActivityClient explorerBase={explorerBase} />
      </section>

      <p className="max-w-2xl text-[11px] leading-relaxed text-[color:var(--text-faint)]">
        Clearing browser storage removes this local index but does not change
        on-chain permissions or escrow. Reconnect the client wallet and import
        the job ID from your transaction receipt to recover its controls.{' '}
        <Link href="/agents" className="text-[color:var(--info)] underline decoration-dotted">
          Browse verified agents
        </Link>
        .
      </p>
    </div>
  );
}
