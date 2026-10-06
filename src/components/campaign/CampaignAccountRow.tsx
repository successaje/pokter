'use client';

import Link from 'next/link';

import { useCallback, useSyncExternalStore } from 'react';

import { campaignVisibleNote, campaignVisiblePercent, summarizeCampaignHires } from '@/lib/campaign/progress';
import { isCampaignLive } from '@/lib/campaign/window';
import { jobsForWallet, subscribeToJobs } from '@/lib/wallet/activity';
import { registrationKey, subscribeToRegistration } from '@/lib/campaign/registration';
import { useActiveWallet } from '@/lib/wallet/active';

const NO_JOBS: ReturnType<typeof jobsForWallet> = [];

/**
 * Set and Earn on the account page, in one line.
 *
 * The full passport was rendered here, and at roughly a third of the page it
 * was the loudest thing on a screen that is supposed to be about the
 * account. A campaign is a thing you are doing with Pokter, not a property
 * of who you are, so it reports its number and offers the way in — the tasks
 * themselves live on the campaign page, which is the one built for them.
 *
 * It disappears entirely once the campaign closes, rather than advertising a
 * finished deadline forever.
 */
export function CampaignAccountRow() {
  const active = useActiveWallet();
  const walletAddress = active.wrongChain ? null : active.address;

  const getJobs = useCallback(
    () => (walletAddress ? jobsForWallet(walletAddress) : NO_JOBS),
    [walletAddress],
  );
  const jobs = useSyncExternalStore(subscribeToJobs, getJobs, () => NO_JOBS);
  const getRegistered = useCallback(
    () => Boolean(walletAddress && window.localStorage.getItem(registrationKey(walletAddress)) === 'yes'),
    [walletAddress],
  );
  const registered = useSyncExternalStore(subscribeToRegistration, getRegistered, () => false);

  if (!isCampaignLive()) return null;

  const progress = summarizeCampaignHires(jobs);
  const percent = campaignVisiblePercent({
    registered,
    distinctAgents: progress.distinctAgents,
    pokterMarketplaceVerified: progress.pokterMarketplaceVerified,
  });

  return (
    <Link
      href="/set-and-earn"
      className="group mt-4 block rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5 transition-colors hover:border-[color:var(--border-strong)]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Set and Earn</h2>
        <span className="tabular text-sm font-semibold text-[color:var(--brand-strong)]">
          {percent}%
        </span>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-raised)]"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Set and Earn progress Pokter can verify"
      >
        <div
          className="h-full rounded-full bg-[color:var(--brand)] transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2.5 text-[11px] leading-4 text-[color:var(--text-muted)]">
        {campaignVisibleNote(percent)}
      </p>
      <span className="mt-3 inline-block text-[11px] font-semibold text-[color:var(--brand-strong)]">
        View all tasks →
      </span>
    </Link>
  );
}
