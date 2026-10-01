'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { summarizeCampaignHires } from '@/lib/campaign/progress';
import { shortAddress } from '@/lib/ui/format';
import { useActiveWallet } from '@/lib/wallet/active';
import { jobsForWallet, noJobs, subscribeToJobs } from '@/lib/wallet/activity';

const REGISTRATION_KEY = 'pokter.set-and-earn.registered.v1';

function registrationKey(wallet: string): string {
  return `${REGISTRATION_KEY}:${wallet.toLowerCase()}`;
}

function Metric({ value, target, label, note }: { value: number; target: number; label: string; note: string }) {
  const complete = value >= target;
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold">{label}</p><p className="mt-1 text-[9px] leading-4 text-[color:var(--text-faint)]">{note}</p></div><span className={`mono rounded-full px-2 py-1 text-[10px] font-semibold ${complete ? 'bg-[color:var(--positive-dim)] text-[color:var(--positive)]' : 'bg-[color:var(--bg-subtle)] text-[color:var(--text-muted)]'}`}>{Math.min(value, target)}/{target}</span></div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[color:var(--border)]"><div className={`h-full rounded-full transition-[width] duration-500 ${complete ? 'bg-[color:var(--positive)]' : 'bg-[color:var(--brand)]'}`} style={{ width: `${Math.min(100, (value / target) * 100)}%` }} /></div>
    </div>
  );
}

export function CampaignPassport() {
  const active = useActiveWallet();
  const walletAddress = active.wrongChain ? null : active.address;
  const getJobsSnapshot = useCallback(() => (walletAddress ? jobsForWallet(walletAddress) : noJobs()), [walletAddress]);
  const jobs = useSyncExternalStore(subscribeToJobs, getJobsSnapshot, noJobs);
  const progress = summarizeCampaignHires(jobs);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    setRegistered(Boolean(walletAddress && window.localStorage.getItem(registrationKey(walletAddress)) === 'yes'));
  }, [walletAddress]);

  const toggleRegistered = () => {
    if (!walletAddress) return;
    const next = !registered;
    setRegistered(next);
    if (next) window.localStorage.setItem(registrationKey(walletAddress), 'yes');
    else window.localStorage.removeItem(registrationKey(walletAddress));
  };

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)]" aria-labelledby="passport-title">
      <div className="grid gap-5 border-b border-[color:var(--border)] bg-[linear-gradient(120deg,var(--brand-highlight-soft),transparent_65%)] p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div><div className="flex flex-wrap items-center gap-2"><p className="mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--brand-strong)]">Pokter proof passport</p>{walletAddress && <span className="mono rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-[9px] text-[color:var(--text-muted)]">{shortAddress(walletAddress)}</span>}</div><h2 id="passport-title" className="mt-2 text-xl font-semibold">Know what Pokter can prove.</h2><p className="mt-2 max-w-2xl text-[11px] leading-5 text-[color:var(--text-secondary)]">This passport reads escrow jobs saved on this device for the connected signing wallet. It separates verified Pokter activity from registration and other-marketplace actions that Pokter cannot independently see.</p></div>
        <Link href="/my-agents" className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-4 text-[11px] font-semibold">Open activity proof →</Link>
      </div>

      {!walletAddress ? (
        <div className="p-5 sm:p-6"><p className="text-sm font-semibold">Connect the campaign wallet to load your passport.</p><p className="mt-2 text-[11px] leading-5 text-[color:var(--text-muted)]">Use the wallet control in the header. Pokter does not connect a different wallet or infer activity from another visitor.</p></div>
      ) : (
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric value={progress.distinctAgents} target={3} label="Different agents" note="Funded Pokter jobs, deduplicated by ERC-8004 identity." />
            <Metric value={progress.pokterMarketplaceVerified ? 1 : 0} target={2} label="Marketplaces" note="Pokter can verify Pokter only; the second marketplace is checked by BNB Chain." />
            <Metric value={progress.qualifyingJobs.length} target={3} label="Recorded hires" note="Pokter jobs that progressed beyond an unfunded draft." />
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4"><p className="text-[11px] font-semibold">Registration checkpoint</p><button type="button" onClick={toggleRegistered} className="mt-3 flex w-full items-center gap-3 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-left"><span className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${registered ? 'border-[color:var(--positive)] bg-[color:var(--positive)] text-white' : 'border-[color:var(--border-strong)]'}`} aria-hidden>{registered ? '✓' : ''}</span><span className="text-[10px] leading-4">I registered this wallet with BNB Chain before starting.</span></button><p className="mt-2 text-[9px] leading-4 text-[color:var(--text-faint)]">Marked by you and stored only on this device. It is not presented as BNB-verified.</p></div>
        </div>
      )}
    </section>
  );
}
