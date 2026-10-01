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

      <Link
        href="/set-and-earn"
        className="group flex flex-col gap-4 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--brand)]/30 bg-[linear-gradient(105deg,var(--brand-highlight-soft),var(--surface)_68%)] p-4 transition-colors hover:border-[color:var(--brand)] sm:flex-row sm:items-center sm:justify-between sm:px-5"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[color:var(--brand-dim)] text-[color:var(--brand-strong)]">
            <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-none stroke-current" strokeWidth="1.8">
              <path d="M4 9h16v11H4zM3 6h18v4H3zM12 6v14M7.5 6C5 5 4.5 2.5 6.5 2c2.2-.6 4.4 2.1 5.5 4M16.5 6c2.5-1 3-3.5 1-4-2.2-.6-4.4 2.1-5.5 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <div className="flex items-center gap-2"><p className="text-[12px] font-semibold">Set and Earn is live</p><span className="rounded-full bg-[color:var(--brand)] px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-black">BNB Chain</span></div>
            <p className="mt-1 text-[10px] leading-4 text-[color:var(--text-muted)]">See which campaign tasks your Pokter activity supports and what you still need to complete.</p>
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-semibold text-[color:var(--brand-strong)] transition-transform group-hover:translate-x-1">View progress →</span>
      </Link>

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
