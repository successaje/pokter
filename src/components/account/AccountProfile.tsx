'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';

import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { jobsForWallet, subscribeToJobs } from '@/lib/wallet/activity';
import { notificationsForWallet, subscribeToNotifications } from '@/lib/wallet/notifications';
import { readSavedAgents, subscribeToSavedAgents } from '@/lib/wallet/saved-agents';
import { shortAddress } from '@/lib/ui/format';
import { useActiveWallet } from '@/lib/wallet/active';
import { ESCROW_CHAIN } from '@/lib/wallet/config';

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function AccountAvatar({ identity }: { identity: string }) {
  const seed = hashSeed(identity.toLowerCase());
  const palettes = [
    ['#F3BA2F', '#FFF3C4', '#18150A'], ['#7C6CF2', '#E8E4FF', '#201A5A'],
    ['#2FBF91', '#DDF8EE', '#0C4A3A'], ['#EE7D52', '#FFE6DC', '#612713'],
    ['#4D91E8', '#DFEDFF', '#143D70'], ['#D45C9D', '#FBE1EF', '#641D45'],
  ];
  const [accent, pale, ink] = palettes[seed % palettes.length];
  const eyeOffset = 16 + (seed % 5);
  const tilt = (seed % 15) - 7;
  return (
    <div className="relative size-24 overflow-hidden rounded-[2rem] border border-black/10 shadow-sm sm:size-28" style={{ background: pale }} aria-label="Your generated Pokter avatar">
      <svg viewBox="0 0 112 112" className="size-full" aria-hidden>
        <circle cx={20 + (seed % 18)} cy={19 + (seed % 12)} r="25" fill={accent} opacity=".28" />
        <circle cx={90 - (seed % 12)} cy={92 - (seed % 17)} r="34" fill={accent} opacity=".2" />
        <g transform={`rotate(${tilt} 56 58)`}>
          <rect x="25" y="24" width="62" height="68" rx="25" fill={accent} />
          <rect x="31" y="30" width="50" height="54" rx="21" fill={pale} />
          <circle cx={eyeOffset + 20} cy="54" r="4" fill={ink} />
          <circle cx={92 - eyeOffset} cy="54" r="4" fill={ink} />
          <path d={seed % 2 ? 'M43 69c8 7 18 7 26 0' : 'M44 70c7-5 17-5 24 0'} fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" />
        </g>
        <path d="M17 22 26 7l8 17" fill={accent} />
      </svg>
    </div>
  );
}

function Stat({ value, label, href }: { value: number; label: string; href: string }) {
  return <Link href={href} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 transition-colors hover:bg-[color:var(--surface-hover)]"><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">{label}</p></Link>;
}

export function AccountProfile() {
  const [copied, setCopied] = useState<string | null>(null);
  const active = useActiveWallet();
  const passkey = usePasskeyWallet();
  const { address: browserAddress, chain } = useAccount();
  const address = active.address;
  const savedCount = useSyncExternalStore(subscribeToSavedAgents, () => readSavedAgents().length, () => 0);
  const jobCount = useSyncExternalStore(subscribeToJobs, () => address ? jobsForWallet(address).length : 0, () => 0);
  const unreadCount = useSyncExternalStore(subscribeToNotifications, () => address ? notificationsForWallet(address).filter((item) => !item.readAt).length : 0, () => 0);
  const builder = useQuery<{ authenticated: boolean; owner?: string }>({
    queryKey: ['builder-session'],
    queryFn: async () => {
      const response = await fetch('/api/builders/session', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Builder session could not be read.');
      return response.json() as Promise<{ authenticated: boolean; owner?: string }>;
    },
    staleTime: 30_000,
  });
  const identity = address ?? browserAddress ?? passkey.wallet?.address ?? 'pokter-guest';
  const builderReady = builder.data?.authenticated && builder.data.owner;
  async function copyAddress(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => current === key ? null : current), 1500);
  }

  return (
    <div className="mx-auto w-full max-w-6xl pb-20 pt-7 sm:pt-12">
      <header className="flex flex-col gap-6 border-b border-[color:var(--border)] pb-8 sm:flex-row sm:items-center">
        <AccountAvatar identity={identity} />
        <div className="min-w-0 flex-1"><p className="mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--brand-strong)]">Pokter account</p><h1 className="mt-2 font-[family-name:var(--font-serif)] text-4xl tracking-tight sm:text-5xl">Your place in the agent economy.</h1><p className="mt-3 max-w-2xl text-[12px] leading-5 text-[color:var(--text-secondary)]">One account view for the wallet that signs, the work you commissioned, and the agents you publish. Your avatar is generated from your wallet address and stays consistent without uploading personal data.</p></div>
      </header>

      <section aria-labelledby="workspace-heading" className="mt-8"><div className="flex items-end justify-between gap-4"><div><p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Workspace</p><h2 id="workspace-heading" className="mt-2 text-xl font-semibold">Choose how you are using Pokter</h2></div></div><div className="mt-4 grid gap-3 md:grid-cols-2">
        <Link href="/app" className="group rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-5 transition-all hover:-translate-y-0.5 hover:border-[color:var(--brand)]"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-full bg-[color:var(--brand-dim)] text-lg">◎</span><span className="text-[color:var(--brand-strong)]">Open →</span></div><h3 className="mt-5 text-lg font-semibold">Personal</h3><p className="mt-1 text-[11px] leading-5 text-[color:var(--text-muted)]">Discover agents, manage commissions, saved choices and notifications.</p></Link>
        <Link href={builderReady ? '/builder' : '/build'} className="group rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-5 transition-all hover:-translate-y-0.5 hover:border-[color:var(--brand)]"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-full bg-[color:var(--caution-dim)] text-lg">◇</span><span className="text-[color:var(--brand-strong)]">{builderReady ? 'Open →' : 'Set up →'}</span></div><h3 className="mt-5 text-lg font-semibold">Builder</h3><p className="mt-1 text-[11px] leading-5 text-[color:var(--text-muted)]">{builderReady ? `Verified as ${shortAddress(builder.data!.owner!)}` : 'Verify an agent identity you own to manage listings and funded work.'}</p></Link>
      </div></section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.6fr)]">
        <section aria-labelledby="wallet-heading" className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-6"><p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Identity and signing</p><h2 id="wallet-heading" className="mt-2 text-xl font-semibold">Wallets on this device</h2><div className="mt-5 divide-y divide-[color:var(--border)]">
          <div className="flex items-center justify-between gap-4 py-4"><div><p className="text-[12px] font-medium">Active signing wallet</p><p className="mt-1 text-[10px] text-[color:var(--text-muted)]">{active.mode === 'passkey' ? 'Protected by your device passkey' : active.mode === 'external' ? 'Connected browser wallet' : 'Connect a wallet to begin'}</p></div>{address ? <button type="button" onClick={() => copyAddress(address, 'active')} className="mono rounded-[var(--radius)] px-2 py-1 text-[10px] hover:bg-[color:var(--surface-hover)]">{copied === 'active' ? 'Copied ✓' : shortAddress(address)}</button> : <span className="mono text-[10px]">Not connected</span>}</div>
          {passkey.wallet && <div className="flex items-center justify-between gap-4 py-4"><div><p className="text-[12px] font-medium">Passkey wallet</p><p className="mt-1 text-[10px] text-[color:var(--text-muted)]">Credential stays in this device or synced passkey provider</p></div><button type="button" onClick={() => copyAddress(passkey.wallet!.address, 'passkey')} className="mono rounded-[var(--radius)] px-2 py-1 text-[10px] hover:bg-[color:var(--surface-hover)]">{copied === 'passkey' ? 'Copied ✓' : shortAddress(passkey.wallet.address)}</button></div>}
          {browserAddress && <div className="flex items-center justify-between gap-4 py-4"><div><p className="text-[12px] font-medium">Browser wallet</p><p className="mt-1 text-[10px] text-[color:var(--text-muted)]">{chain?.id === ESCROW_CHAIN.id ? `${ESCROW_CHAIN.name} · ready` : `${chain?.name ?? 'Unknown network'} · switch before transacting`}</p></div><button type="button" onClick={() => copyAddress(browserAddress, 'browser')} className="mono rounded-[var(--radius)] px-2 py-1 text-[10px] hover:bg-[color:var(--surface-hover)]">{copied === 'browser' ? 'Copied ✓' : shortAddress(browserAddress)}</button></div>}
        </div><p className="mt-4 text-[9px] leading-4 text-[color:var(--text-faint)]">Pokter does not create a username/password profile or hold your private keys. Account data shown here is derived from connected wallets, signed builder verification and this device.</p></section>

        <aside><div className="grid grid-cols-3 gap-2"><Stat value={jobCount} label="Jobs" href="/my-agents" /><Stat value={savedCount} label="Saved" href="/saved" /><Stat value={unreadCount} label="Unread" href="/my-agents" /></div><div className="mt-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5"><h2 className="text-sm font-semibold">Quick access</h2><div className="mt-3 grid gap-1 text-[11px]"><Link href="/discover" className="rounded-[var(--radius)] px-3 py-2.5 hover:bg-[color:var(--surface-hover)]">Find an agent <span className="float-right">→</span></Link><Link href="/compare" className="rounded-[var(--radius)] px-3 py-2.5 hover:bg-[color:var(--surface-hover)]">Compare saved agents <span className="float-right">→</span></Link><Link href="/my-agents" className="rounded-[var(--radius)] px-3 py-2.5 hover:bg-[color:var(--surface-hover)]">Jobs and notifications <span className="float-right">→</span></Link></div></div></aside>
      </div>
    </div>
  );
}
