'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { formatEther, formatUnits } from 'viem';

import { Wordmark } from '@/components/brand/Logo';
import { ConnectWallet } from '@/components/shell/ConnectWallet';
import { WorkspaceModeSwitch } from '@/components/workspace/WorkspaceModeSwitch';
import { usePasskeyWallet } from '@/lib/wallet/PasskeyProvider';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import {
  jobsForWallet,
  noJobs,
  noSessions,
  sessionsForWallet,
  subscribeToJobs,
  subscribeToSessions,
} from '@/lib/wallet/activity';
import { NETWORK_LABEL, NATIVE_SYMBOL } from '@/lib/network/presentation';
import { shortAddress } from '@/lib/ui/format';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import { useActiveWallet } from '@/lib/wallet/active';
import { externalBalances } from '@/lib/wallet/external';
import { readSavedAgents, subscribeToSavedAgents } from '@/lib/wallet/saved-agents';

type IconName = 'home' | 'discover' | 'agents' | 'activity' | 'compare' | 'shield' | 'arrow';

function AppIcon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  const common = { className: `${className} fill-none stroke-current`, strokeWidth: 1.8, 'aria-hidden': true } as const;
  if (name === 'home') return <svg viewBox="0 0 24 24" {...common}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></svg>;
  if (name === 'discover') return <svg viewBox="0 0 24 24" {...common}><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5M11 8v6M8 11h6" /></svg>;
  if (name === 'agents') return <svg viewBox="0 0 24 24" {...common}><rect x="4" y="6" width="16" height="13" rx="4" /><path d="M9 11h.01M15 11h.01M9 15h6M12 6V3" /></svg>;
  if (name === 'activity') return <svg viewBox="0 0 24 24" {...common}><path d="M4 19V9M10 19V5M16 19v-7M22 19V2" /></svg>;
  if (name === 'compare') return <svg viewBox="0 0 24 24" {...common}><path d="M8 4v16M16 4v16M4 8h8M12 16h8" /></svg>;
  if (name === 'shield') return <svg viewBox="0 0 24 24" {...common}><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-5" /></svg>;
  return <svg viewBox="0 0 24 24" {...common}><path d="M5 12h14m-5-5 5 5-5 5" /></svg>;
}

const QUICK_ACTIONS = [
  { href: '/discover', label: 'Find an agent', detail: 'Start with your goal', icon: 'discover' },
  { href: '/agents', label: 'Browse agents', detail: 'Review live evidence', icon: 'agents' },
  { href: '/compare', label: 'Compare', detail: 'Evaluate side by side', icon: 'compare' },
] as const;

export function MobileAppHome() {
  const passkey = usePasskeyWallet();
  const activeWallet = useActiveWallet();
  const walletAddress = activeWallet.address;
  const paymentToken = correctedErc8183Addresses(WALLET_NETWORK.chainId).paymentToken;
  const balances = useQuery({
    queryKey: ['app-wallet-balances', activeWallet.mode, walletAddress, paymentToken],
    queryFn: async () => {
      if (activeWallet.mode === 'external') {
        const result = await externalBalances();
        return result ? { native: result.native, payment: result.payment } : null;
      }
      const result = await walletClient().balances({ wallet: walletAddress!, tokens: [paymentToken] });
      const payment = result.tokens?.[0];
      return { native: result.native, payment: payment?.ok ? payment.raw : null };
    },
    enabled: Boolean(walletAddress),
    refetchInterval: 30_000,
  });
  const [savedCount, setSavedCount] = useState(0);
  useEffect(() => {
    const refresh = () => setSavedCount(readSavedAgents().length);
    refresh();
    return subscribeToSavedAgents(refresh);
  }, []);

  const getJobs = useCallback(
    () => (walletAddress ? jobsForWallet(walletAddress) : noJobs()),
    [walletAddress],
  );
  const getSessions = useCallback(
    () => (walletAddress ? sessionsForWallet(walletAddress) : noSessions()),
    [walletAddress],
  );
  const jobs = useSyncExternalStore(subscribeToJobs, getJobs, noJobs);
  const sessions = useSyncExternalStore(subscribeToSessions, getSessions, noSessions);
  const activeJobs = jobs.filter((job) => ['OPEN', 'FUNDED', 'SUBMITTED'].includes(job.status));
  const committedJobs = jobs.filter((job) => ['FUNDED', 'SUBMITTED'].includes(job.status));
  const committed = committedJobs.reduce((sum, job) => sum + BigInt(job.budgetRaw), 0n);
  const needsAttention = jobs.filter((job) => ['SUBMITTED', 'EXPIRED'].includes(job.status));
  const recentJobs = [...jobs].sort((a, b) => Date.parse(b.hiredAt) - Date.parse(a.hiredAt)).slice(0, 3);
  const activeSessions = sessions.filter((session) => !session.revokedAt);
  const paymentBalance = balances.data?.payment;

  return (
    <div data-pokter-app-home className="app-home mx-auto min-h-[100svh] w-full max-w-[520px] bg-[color:var(--bg)] md:max-w-5xl">
      {/*
        One header, two rows. The wordmark bar and the page title used to be
        separate stacked blocks, which read as two headers sitting on top of
        each other — the identity row, then another row that also looked like
        a header. Folding the title in gives the screen a single top edge, the
        way a native app's large-title header works.

        Phone chrome only. Above 768px the site header is visible again.
      */}
      {/*
        Only this bar pins. A header tall enough to hold the large title too
        would sit on 15% of a phone screen for the whole session, on top of the
        floated tab bar. So the title is a sibling that scrolls away underneath,
        the way a native large title does — it cannot live inside the bar, since
        a sticky element can only travel within its own parent's box.
      */}
      <header className="app-safe-top sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[color:var(--border)] bg-[color:var(--bg)]/92 px-5 pb-3 backdrop-blur-xl md:hidden">
        <Link href="/app" aria-label="Pokter app home" className="tap"><Wordmark size={22} /></Link>
        <div className="flex items-center gap-2">
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">
            <span className="size-1.5 rotate-45 bg-[color:var(--brand)]" aria-hidden />
            {NETWORK_LABEL}
          </span>
          <ConnectWallet />
        </div>
      </header>
      <div className="px-5 pb-1 pt-4 md:hidden">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--text-faint)]">Today</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-[-0.035em]">Your personal workspace</h1>
        <div className="mt-4">
          <WorkspaceModeSwitch current="personal" />
        </div>
      </div>

      {/*
        A div, not a <main>: the root layout already provides the page's main
        landmark, and nesting a second one is invalid HTML and gives screen
        readers two competing "main" regions.
      */}
      <div className="flex flex-col gap-7 px-5 pb-28 pt-6">
        {/*
          The same title for the wide layout. It lives inside the phone header
          above, which is md:hidden — folding it there removed it entirely from
          desktop, where the site chrome provides navigation but no page title.
        */}
        <section className="hidden items-start justify-between gap-4 md:flex">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--text-faint)]">Today</p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-[-0.035em]">Your personal workspace</h1>
            <div className="mt-4">
              <WorkspaceModeSwitch current="personal" />
            </div>
          </div>
          <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[10px] text-[color:var(--text-muted)]">
            <span className="size-1.5 rotate-45 bg-[color:var(--brand)]" aria-hidden />
            {NETWORK_LABEL}
          </span>
        </section>

        {walletAddress ? (
          <section className="overflow-hidden rounded-2xl border border-[color:var(--border-strong)] bg-[linear-gradient(145deg,var(--surface-raised),var(--surface))] shadow-[0_18px_45px_rgba(0,0,0,.14)]">
            <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-[color:var(--text-secondary)]"><span className="text-[color:var(--positive)]"><AppIcon name="shield" className="size-4" /></span>{activeWallet.mode === 'external' ? 'Your wallet' : 'Passkey wallet'}</div>
              <span className="mono text-[10px] text-[color:var(--text-muted)]">{shortAddress(walletAddress)}</span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-[color:var(--border)]">
              <div className="p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-faint)]">Available</p><p className="tabular mt-2 text-lg font-medium">{paymentBalance !== null && paymentBalance !== undefined ? Number(formatUnits(paymentBalance, 18)).toFixed(2) : '—'} <span className="text-xs text-[color:var(--text-muted)]">$U</span></p><p className="mt-1 text-[9px] text-[color:var(--text-faint)]">{balances.data ? `${Number(formatEther(balances.data.native)).toFixed(4)} ${NATIVE_SYMBOL} for gas` : 'Reading wallet balance'}</p></div>
              <div className="p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-faint)]">Committed to jobs</p><p className="tabular mt-2 text-lg font-medium">{Number(formatUnits(committed, 18)).toFixed(2)} <span className="text-xs text-[color:var(--text-muted)]">$U</span></p><p className="mt-1 text-[9px] text-[color:var(--text-faint)]">Funded or awaiting review</p></div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand)]"><AppIcon name="shield" /></div>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">Connect your signing wallet</h2>
            <p className="mt-2 text-xs leading-relaxed text-[color:var(--text-secondary)]">Use your Pokter passkey to see balances, active agents and approvals on this device.</p>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={!passkey.ready || !passkey.supported || passkey.busy !== null} onClick={() => passkey.recover()} className="action-primary flex-1 rounded-[var(--radius)] px-4 text-sm">{passkey.busy === 'recovering' ? 'Waiting…' : 'Use existing passkey'}</button>
              <button type="button" disabled={!passkey.ready || !passkey.supported || passkey.busy !== null} onClick={() => passkey.create()} className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 text-sm font-medium">Create</button>
            </div>
            {passkey.error && <p className="mt-3 text-[12px] leading-relaxed text-[color:var(--negative)]">{passkey.error}</p>}
          </section>
        )}

        <section className="grid grid-cols-3 gap-2" aria-label="Personal overview">
          {[
            { href: '/activity', value: walletAddress ? activeJobs.length : '—', label: 'Active jobs' },
            { href: '/saved', value: savedCount, label: 'Saved agents' },
            { href: '/activity', value: walletAddress ? needsAttention.length : '—', label: 'Need attention' },
          ].map((item) => (
            <Link key={item.label} href={item.href} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 transition-colors hover:bg-[color:var(--surface-hover)]">
              <p className="tabular text-xl font-semibold">{item.value}</p>
              <p className="mt-1 text-[10px] leading-tight text-[color:var(--text-muted)]">{item.label}</p>
            </Link>
          ))}
        </section>

        {needsAttention.length > 0 && (
          <section className="rounded-2xl border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--caution)]">Needs attention</p>
            <div className="mt-3 flex flex-col gap-3">
              {needsAttention.slice(0, 2).map((job) => (
                <Link key={job.id} href="/activity" className="flex items-center justify-between gap-3">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{job.agentName}</span><span className="block text-[11px] text-[color:var(--text-muted)]">{job.status === 'SUBMITTED' ? 'Delivery is ready for review' : 'Job expired; check reclaim options'}</span></span>
                  <span className="shrink-0 text-[11px] font-medium">Review →</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Quick actions</h2><span className="text-[10px] text-[color:var(--text-faint)]">Evidence before action</span></div>
          <div className="grid gap-2 md:grid-cols-3">
            {QUICK_ACTIONS.map((action, index) => (
              <Link key={action.href} href={action.href} className="group flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 transition-colors hover:bg-[color:var(--surface-hover)]">
                <span className={`flex size-10 items-center justify-center rounded-xl ${index === 0 ? 'bg-[color:var(--brand)] text-[color:var(--brand-ink)]' : 'bg-[color:var(--bg-subtle)] text-[color:var(--text-secondary)]'}`}><AppIcon name={action.icon} /></span>
                <span className="flex flex-1 flex-col"><span className="text-sm font-medium">{action.label}</span><span className="text-[11px] text-[color:var(--text-muted)]">{action.detail}</span></span>
                <span className="text-[color:var(--text-faint)] transition-transform group-hover:translate-x-0.5"><AppIcon name="arrow" className="size-4" /></span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]">
          <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">Activity</h2><Link href="/activity" className="tap text-[11px] text-[color:var(--info)]">View all</Link></div>
          <div className="grid grid-cols-2 divide-x divide-[color:var(--border)]">
            <Link href="/activity" className="p-4"><p className="tabular text-2xl font-semibold">{walletAddress ? activeJobs.length : '—'}</p><p className="mt-1 text-[11px] text-[color:var(--text-muted)]">Active jobs</p></Link>
            <Link href="/activity" className="p-4"><p className="tabular text-2xl font-semibold">{walletAddress ? activeSessions.length : '—'}</p><p className="mt-1 text-[11px] text-[color:var(--text-muted)]">Wallet sessions</p></Link>
          </div>
          {!walletAddress && <p className="border-t border-[color:var(--border)] px-4 py-3 text-[11px] text-[color:var(--text-faint)]">Connect your passkey wallet to load device-owned activity.</p>}
        </section>

        {recentJobs.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Recent activity</h2><Link href="/activity" className="text-[11px] text-[color:var(--info)]">View all</Link></div>
            <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]">
              {recentJobs.map((job) => (
                <Link key={job.id} href="/activity" className="flex items-center gap-3 border-t border-[color:var(--border)] px-4 py-3 first:border-t-0 hover:bg-[color:var(--surface-hover)]">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--bg-subtle)] text-[color:var(--text-muted)]"><AppIcon name="activity" className="size-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-medium">{job.agentName}</span><span className="block text-[10px] text-[color:var(--text-muted)]">Job #{job.jobId} · {job.status.toLowerCase()}</span></span>
                  <span className="text-[11px] font-medium">{Number(formatUnits(BigInt(job.budgetRaw), 18)).toFixed(2)} $U</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
