import Link from 'next/link';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import { PrivateActivityClient } from '@/components/jobs/PrivateActivityClient';
import { RecoverJob } from '@/components/jobs/RecoverJob';
import { isCampaignLive } from '@/lib/campaign/window';

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
      {/*
        The way out of this page, next to its title.

        Activity is where somebody lands after hiring, and it answers one
        question — what happened to my jobs. Everything adjacent to that
        (which wallets this device holds, whether they are hiring or
        building, saved agents, notification settings) lives on the account
        page, which until now was reachable only from the wallet popover in
        the header. Somebody reading their jobs had no visible route to the
        rest of their own account.

        Top right rather than in the prose, because it is a destination and
        not part of the sentence explaining what this page holds.
      */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <header className="flex max-w-3xl flex-col gap-3">
          <h1 className="font-[family-name:var(--font-serif)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Your activity
          </h1>
          <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
            Track jobs, review deliverables and manage agent permissions.
            Records are held on this device — a job funded on another one is
            recovered below, by its ID.
          </p>
        </header>

        <Link
          href="/account"
          className="tap inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 py-2 text-[13px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
        >
          My account
          <span aria-hidden>→</span>
        </Link>
      </div>

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
        {/*
          Above the list, because somebody who cannot find their job is
          looking for the way to get it back, not scrolling an empty list
          to see whether it is there. The sentence at the top of the page
          promised this for a long time without offering anywhere to type.
        */}
        <RecoverJob />

        <PrivateActivityClient explorerBase={explorerBase} />
      </section>

      {/*
        Below the activity, and only while the campaign runs.

        This is a 208px black-and-gold billboard, and it sat above the page's
        own content on a page called "Your activity" — so someone arriving to
        check a job they had paid for met an advertisement first, and someone
        with no jobs yet met one instead of anything about their account. It
        was also unconditional, which would have left it advertising a live
        campaign after the campaign had closed.
      */}
      {isCampaignLive() && (
        <Link
          href="/set-and-earn"
          className="group relative flex min-h-52 flex-col justify-center overflow-hidden rounded-[var(--radius-lg)] border border-[#F3BA2F]/25 bg-[radial-gradient(circle_at_78%_48%,rgba(243,186,47,.2),transparent_27%),linear-gradient(115deg,#11100c,#1c180c)] p-6 text-white transition-colors hover:border-[#F3BA2F]/50 sm:p-8"
        >
          <div className="relative z-10 max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#F3BA2F] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#171306]">
              <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-none stroke-current" strokeWidth="1.8">
                <path d="M4 9h16v11H4zM3 6h18v4H3zM12 6v14M7.5 6C5 5 4.5 2.5 6.5 2c2.2-.6 4.4 2.1 5.5 4M16.5 6c2.5-1 3-3.5 1-4-2.2-.6-4.4 2.1-5.5 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Set and Earn is live
            </span>
            <h2 className="mt-4 font-[family-name:var(--font-serif)] text-3xl leading-tight sm:text-4xl">Complete tasks. Earn rewards.</h2>
            <p className="mt-2 max-w-xl text-[12px] leading-5 text-white/65">Hire and build real agents on BNB Chain. Track what Pokter can verify and see exactly what remains.</p>
            <span className="mt-5 inline-flex min-h-10 items-center rounded-[var(--radius)] bg-[#F3BA2F] px-4 text-[10px] font-semibold text-[#171306] transition-transform group-hover:translate-x-1">View Set and Earn →</span>
          </div>
          <svg viewBox="0 0 64 64" aria-hidden className="absolute -bottom-7 right-[8%] hidden size-52 fill-none stroke-[#F3BA2F]/55 lg:block" strokeWidth="1.3"><path d="M11 27h42v27H11zM8 18h48v10H8zM32 18v36M19 18c-5-2-7-8-3-11 5-4 13 4 16 11M45 18c5-2 7-8 3-11-5-4-13 4-16 11" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
      )}

      <p className="max-w-2xl text-[12px] leading-relaxed text-[color:var(--text-faint)]">
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
