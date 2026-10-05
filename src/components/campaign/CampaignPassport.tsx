'use client';

import Link from 'next/link';
import { useCallback, useSyncExternalStore, type ReactNode } from 'react';

import { summarizeCampaignHires } from '@/lib/campaign/progress';
import { shortAddress } from '@/lib/ui/format';
import { useActiveWallet } from '@/lib/wallet/active';
import { jobsForWallet, noJobs, subscribeToJobs } from '@/lib/wallet/activity';
import { CAMPAIGN_END_LABEL } from '@/lib/campaign/window';

const CAMPAIGN = 'https://www.bnbchain.org/en/hackathons/smart-money-era-set-and-earn';
const REGISTRATION_KEY = 'pokter.set-and-earn.registered.v1';
const REGISTRATION_EVENT = 'pokter:set-and-earn-registration-changed';
const actionClass = 'inline-flex min-h-9 items-center justify-center rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-3 text-[10px] font-semibold transition-colors hover:bg-[color:var(--surface-hover)]';

function registrationKey(wallet: string) { return `${REGISTRATION_KEY}:${wallet.toLowerCase()}`; }
function subscribeToRegistration(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(REGISTRATION_EVENT, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(REGISTRATION_EVENT, listener); };
}

function ProgressBar({ value, target, complete = false }: { value: number; target: number; complete?: boolean }) {
  return <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--border)]" aria-hidden><div className={`h-full rounded-full transition-[width] duration-500 ${complete ? 'bg-[color:var(--positive)]' : 'bg-[color:var(--brand)]'}`} style={{ width: `${Math.min(100, (value / target) * 100)}%` }} /></div>;
}

function TaskIcon({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'positive' | 'info' | 'caution' }) {
  const tones = { brand: 'bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand-strong)]', positive: 'bg-[color:var(--positive-dim)] text-[color:var(--positive)]', info: 'bg-[color:var(--info-dim)] text-[color:var(--info)]', caution: 'bg-[color:var(--caution-dim)] text-[color:var(--caution)]' };
  return <span className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${tones[tone]}`}>{children}</span>;
}

/*
 * `hat` says which side of the marketplace a task is asking you to stand on.
 *
 * The five requirements alternate — register, hire, build, build, hire — and
 * nothing said so. A reader working down the list met "Hire three different
 * agents" and then "Build and list one quality agent" with identical
 * framing, so the two tasks that need you to have shipped an agent looked
 * like the next thing to do rather than a separate track. The numbers and
 * their order are BNB Chain's, not ours, so they stay exactly as published;
 * this only labels what each one needs.
 */
function TaskRow({ icon, title, body, status, progress, action, complete = false, tone = 'brand', hat }: { icon: ReactNode; title: string; body: string; status: string; progress?: { value: number; target: number }; action: ReactNode; complete?: boolean; tone?: 'brand' | 'positive' | 'info' | 'caution'; hat?: 'hiring' | 'building' }) {
  return <li className="grid gap-4 border-t border-[color:var(--border)] px-4 py-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-center sm:px-5"><div className="flex min-w-0 items-start gap-3"><TaskIcon tone={complete ? 'positive' : tone}>{complete ? '✓' : icon}</TaskIcon><div><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h3 className="text-[12px] font-semibold">{title}</h3>{hat && <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[color:var(--text-muted)]">{hat === 'hiring' ? 'As a hirer' : 'As a builder'}</span>}</div><p className="mt-1 text-[12px] leading-4 text-[color:var(--text-muted)]">{body}</p></div></div><div><p className={`mb-2 text-[10px] font-semibold ${complete ? 'text-[color:var(--positive)]' : 'text-[color:var(--text-secondary)]'}`}>{status}</p>{progress && <ProgressBar value={progress.value} target={progress.target} complete={complete} />}</div><div className="sm:justify-self-end">{action}</div></li>;
}

export function CampaignPassport({ compact = false }: { compact?: boolean }) {
  const active = useActiveWallet();
  const walletAddress = active.wrongChain ? null : active.address;
  const getJobsSnapshot = useCallback(() => (walletAddress ? jobsForWallet(walletAddress) : noJobs()), [walletAddress]);
  const jobs = useSyncExternalStore(subscribeToJobs, getJobsSnapshot, noJobs);
  const progress = summarizeCampaignHires(jobs);
  const getRegistrationSnapshot = useCallback(() => Boolean(walletAddress && window.localStorage.getItem(registrationKey(walletAddress)) === 'yes'), [walletAddress]);
  const registered = useSyncExternalStore(subscribeToRegistration, getRegistrationSnapshot, () => false);
  const hireComplete = progress.distinctAgents >= 3;
  /*
   * Out of what Pokter can actually see, not out of five.
   *
   * The denominator was 5, one per official task, but only three of the
   * five produce any signal here and one of those is worth half — so the
   * most a wallet could ever reach was 2.5 of 5. Somebody who registered,
   * hired three agents and had them verified saw 50% and a half-empty bar,
   * with nothing on the page explaining what the other half was waiting
   * for. The bar was not measuring their progress, it was measuring
   * Pokter's visibility, and reporting the shortfall as theirs.
   *
   * The denominator is now that ceiling, so full means "everything Pokter
   * can verify is done". The caption already says this is not an
   * eligibility score, and the task list below is where the rest lives.
   */
  const VISIBLE_CEILING = 1 + 1 + 0.5;
  const visibleMilestones =
    Number(registered) +
    Math.min(progress.distinctAgents, 3) / 3 +
    (progress.pokterMarketplaceVerified ? 0.5 : 0);
  const visiblePercent = Math.round(
    (Math.min(visibleMilestones, VISIBLE_CEILING) / VISIBLE_CEILING) * 100,
  );

  const toggleRegistered = () => {
    if (!walletAddress) return;
    if (registered) window.localStorage.removeItem(registrationKey(walletAddress));
    else window.localStorage.setItem(registrationKey(walletAddress), 'yes');
    window.dispatchEvent(new Event(REGISTRATION_EVENT));
  };

  return <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)]" aria-labelledby="tracker-title">
    <div className="grid gap-3 border-b border-[color:var(--border)] p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--brand-strong)]">Pokter-visible progress</p>{walletAddress && <span className="mono rounded-full border border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-2 py-1 text-[9px] text-[color:var(--text-muted)]">{shortAddress(walletAddress)}</span>}</div><h2 id="tracker-title" className="mt-2 text-xl font-semibold">Your Set and Earn progress</h2><p className="mt-1 text-[12px] leading-4 text-[color:var(--text-muted)]">Verified Pokter activity and checkpoints saved on this device. BNB Chain makes the final eligibility decision.</p></div>{compact ? <Link href="/set-and-earn" className={actionClass}>View all tasks →</Link> : <a href={CAMPAIGN} target="_blank" rel="noreferrer" className={actionClass}>Official campaign guide ↗</a>}</div>

    {!walletAddress && <div className="border-b border-[color:var(--border)] bg-[color:var(--info-dim)] px-5 py-3"><p className="text-[10px] font-semibold text-[color:var(--info)]">Connect your campaign wallet to load verified progress.</p><p className="mt-1 text-[9px] leading-4 text-[color:var(--text-muted)]">You can still review every task below. Use the same wallet you registered with BNB Chain.</p></div>}
    <>
      <div className="grid gap-3 bg-[linear-gradient(120deg,var(--brand-highlight-soft),transparent_64%)] p-4 sm:grid-cols-2 sm:p-5"><div className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--surface)]/90 p-4"><div className="flex items-baseline justify-between gap-3"><div><p className="text-[11px] font-semibold">Progress Pokter can see</p><p className="mt-1 text-[9px] text-[color:var(--text-faint)]">Includes partial progress; not an eligibility score.</p></div><span className="text-xl font-semibold">{visiblePercent}%</span></div><div className="mt-4"><ProgressBar value={visiblePercent} target={100} /></div></div><div className="flex items-center gap-4 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--surface)]/90 p-4"><TaskIcon tone="caution"><svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-none stroke-current" strokeWidth="1.8"><path d="M4 9h16v11H4zM3 6h18v4H3zM12 6v14M7.5 6C5 5 4.5 2.5 6.5 2c2.2-.6 4.4 2.1 5.5 4M16.5 6c2.5-1 3-3.5 1-4-2.2-.6-4.4 2.1-5.5 4" strokeLinecap="round" strokeLinejoin="round" /></svg></TaskIcon><div><p className="text-[11px] font-semibold">First 100 qualifying wallets</p><p className="mt-1 text-[9px] leading-4 text-[color:var(--text-muted)]">$10,000 total retail value · physical merchandise</p></div></div></div>

      <div className="border-t border-[color:var(--border)]"><div className="flex items-end justify-between gap-3 px-4 pb-2 pt-5 sm:px-5"><div><h3 className="text-sm font-semibold">Tasks</h3><p className="mt-1 text-[9px] text-[color:var(--text-faint)]">Complete official requirements with the same registered wallet.</p></div><span className="mono text-[9px] text-[color:var(--text-faint)]">{CAMPAIGN_END_LABEL}</span></div><ol>
        <TaskRow icon="1" title="Register your campaign wallet" body="Register before completing tasks, then use this same wallet throughout." status={registered ? 'Marked complete on this device' : walletAddress ? 'Confirmation needed' : 'Connect wallet to confirm'} complete={registered} tone="info" action={<button type="button" onClick={toggleRegistered} disabled={!walletAddress} className={`${actionClass} disabled:cursor-not-allowed disabled:opacity-45`}>{registered ? 'Undo' : 'I registered'}</button>} />
        <TaskRow hat="hiring" icon="2" title="Hire three different agents" body="Across at least two shortlisted marketplaces. Pokter can only verify hires made here." status={`${Math.min(progress.distinctAgents, 3)} / 3 agents · ${progress.pokterMarketplaceVerified ? '1' : '0'} / 2 marketplaces visible`} progress={{ value: progress.distinctAgents, target: 3 }} complete={hireComplete} action={<Link href="/discover" className={actionClass}>Browse agents →</Link>} />
        {!compact && <TaskRow hat="building" icon="3" title="Build and list one quality agent" body="Publish a post-announcement yield, grid, rebalancing or health-factor agent under ERC-8004." status="Builder evidence not yet verified" tone="caution" action={<Link href="/build" className={actionClass}>Go to builder →</Link>} />}
        {/*
          Tasks 4 and 5 read "0 / 3 independently verified" and "0 / 5
          actions · 0 / 3 days verified" as fixed text, with progress bars
          pinned at zero. Those are claims about measurements this page had
          not taken, and they were wrong for any builder who had in fact
          been hired — the worst way to be wrong, because the reader has no
          reason to doubt a number.

          The counting happens on the builder page, where the owner is
          known and the escrow contract can be read for who funded each
          job. These two now point there instead of inventing a figure.
        */}
        {!compact && <TaskRow hat="building" icon="4" title="Prove independent use" body="Reach three completed hires from three independent wallets you do not own or fund." status="Counted on your builder page" tone="info" action={<Link href="/builder" className={actionClass}>Builder activity →</Link>} />}
        {!compact && <TaskRow hat="building" icon="5" title="Complete category activity" body="Record five category-consistent onchain actions over three separate days." status="Counted on your builder page" tone="info" action={<Link href="/activity" className={actionClass}>View proof →</Link>} />}
      </ol></div>
      {!compact && <div className="border-t border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-5 py-3 text-[9px] leading-4 text-[color:var(--text-faint)]">Registration is self-marked and stored only on this device. Other-marketplace hires and builder activity remain pending until Pokter can verify them. <a href={CAMPAIGN} target="_blank" rel="noreferrer" className="font-semibold text-[color:var(--brand-strong)] hover:underline">Read the official rules ↗</a></div>}
    </>
  </section>;
}
