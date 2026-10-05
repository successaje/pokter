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
import { BuilderSection } from '@/components/account/BuilderSection';
import { ESCROW_CHAIN } from '@/lib/wallet/config';
import { CampaignAccountRow } from '@/components/campaign/CampaignAccountRow';

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

function Chip({ label, tone }: { label: string; tone: 'good' | 'warn' | 'muted' }) {
  const palette = {
    good: 'border-[color:var(--positive)]/35 bg-[color:var(--positive-dim)] text-[color:var(--positive)]',
    warn: 'border-[color:var(--caution)]/40 bg-[color:var(--caution-dim)] text-[color:var(--caution)]',
    muted: 'border-[color:var(--border)] text-[color:var(--text-muted)]',
  }[tone];
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${palette}`}>
      {label}
    </span>
  );
}

/*
 * One row per wallet, instead of the same forty-element line written three
 * times. The three copies had already drifted — only one of them handled
 * the not-connected case.
 */
function WalletRow({
  title,
  note,
  address,
  copyKey,
  copied,
  onCopy,
}: {
  title: string;
  note: string;
  address: string | null;
  copyKey: string;
  copied: string | null;
  onCopy: (value: string, key: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="text-[12px] font-medium">{title}</p>
        <p className="mt-1 text-[10px] text-[color:var(--text-muted)]">{note}</p>
      </div>
      {address ? (
        <button
          type="button"
          onClick={() => onCopy(address, copyKey)}
          className="mono shrink-0 rounded-[var(--radius)] border border-[color:var(--border)] px-2.5 py-1.5 text-[10px] transition-colors hover:bg-[color:var(--surface-hover)]"
        >
          {copied === copyKey ? 'Copied ✓' : shortAddress(address)}
        </button>
      ) : (
        <span className="mono shrink-0 text-[10px] text-[color:var(--text-muted)]">
          Not connected
        </span>
      )}
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
  const builderInbox = useQuery<{ unread: number }>({
    queryKey: ['builder-notifications'],
    queryFn: async () => {
      const response = await fetch('/api/builders/notifications', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Builder alerts could not be read.');
      return response.json() as Promise<{ unread: number }>;
    },
    enabled: Boolean(builder.data?.authenticated),
    staleTime: 30_000,
  });
  const owned = useQuery<{ agents: unknown[] }>({
    queryKey: ['owned-agents', address],
    enabled: Boolean(address),
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch(`/api/builders/agents?address=${address}`);
      if (!response.ok) throw new Error('Could not read your agents.');
      return response.json() as Promise<{ agents: unknown[] }>;
    },
  });
  const publishedCount = owned.data?.agents.length ?? 0;
  const identity = address ?? browserAddress ?? passkey.wallet?.address ?? 'pokter-guest';
  const builderReady = builder.data?.authenticated && builder.data.owner;
  async function copyAddress(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => current === key ? null : current), 1500);
  }

  return (
    <div className="mx-auto w-full max-w-6xl pb-20 pt-7 sm:pt-12">
      {/*
        The header states who you are, not what Pokter is for.

        It used to carry a marketing headline and a paragraph about how the
        avatar is generated — on a page nobody reaches without already using
        the product. The address and the state of the wallet signing with it
        are the facts somebody opens an account page to check, so they are
        the header now, and the avatar explanation moved to the footnote
        where that sort of thing belongs.
      */}
      <header className="flex flex-col gap-6 border-b border-[color:var(--border)] pb-8 sm:flex-row sm:items-center">
        <AccountAvatar identity={identity} />
        <div className="min-w-0 flex-1">
          <p className="mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--brand-strong)]">
            Pokter account
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-serif)] text-4xl tracking-tight sm:text-5xl">
            {/*
              The address is the title when there is one, because that is the
              account's actual name here. With nothing connected it says so
              in the chip below rather than shouting "Not connected" at
              display size, which reads as an error on a page that is working
              exactly as intended.
            */}
            {address ? shortAddress(address) : 'Your account'}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Chip
              tone={active.mode ? 'good' : 'muted'}
              label={
                active.mode === 'passkey'
                  ? 'Passkey wallet'
                  : active.mode === 'external'
                    ? 'Browser wallet'
                    : 'No wallet connected'
              }
            />
            <Chip
              tone={active.wrongChain ? 'warn' : address ? 'good' : 'muted'}
              label={active.wrongChain ? `Switch to ${ESCROW_CHAIN.name}` : ESCROW_CHAIN.name}
            />
            <Chip
              tone={builderReady ? 'good' : 'muted'}
              label={builderReady ? 'Ownership verified' : 'Ownership not verified'}
            />
            {address && (
              <button
                type="button"
                onClick={() => copyAddress(address, 'header')}
                className="mono rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[10px] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
              >
                {copied === 'header' ? 'Copied ✓' : 'Copy address'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/*
        Four counts across the top, where a sidebar used to hold three.

        These are the page's answer to "what do I have here", so they lead
        rather than sit in the margin — and the fourth, agents published,
        was missing entirely despite being half of what this product is.
        It reuses the query key the published list below already fetches on,
        so counting them costs no extra request.
      */}
      <section aria-label="Your totals" className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={jobCount} label="Jobs" href="/activity" />
        <Stat value={publishedCount} label="Agents published" href="/builder" />
        <Stat value={savedCount} label="Saved" href="/saved" />
        <Stat
          value={unreadCount + (builderInbox.data?.unread ?? 0)}
          label="Unread"
          href={builderReady ? '/builder#jobs' : '/activity'}
        />
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.6fr)]">
        <section
          aria-labelledby="wallet-heading"
          className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-6"
        >
          <p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">
            Identity and signing
          </p>
          <h2 id="wallet-heading" className="mt-2 text-xl font-semibold">
            Wallets on this device
          </h2>
          <div className="mt-5 divide-y divide-[color:var(--border)]">
            <WalletRow
              title="Active signing wallet"
              note={
                active.mode === 'passkey'
                  ? 'Protected by your device passkey'
                  : active.mode === 'external'
                    ? 'Connected browser wallet'
                    : 'Connect a wallet to begin'
              }
              address={address}
              copyKey="active"
              copied={copied}
              onCopy={copyAddress}
            />
            {passkey.wallet && (
              <WalletRow
                title="Passkey wallet"
                note="Credential stays in this device or synced passkey provider"
                address={passkey.wallet.address}
                copyKey="passkey"
                copied={copied}
                onCopy={copyAddress}
              />
            )}
            {browserAddress && (
              <WalletRow
                title="Browser wallet"
                note={
                  chain?.id === ESCROW_CHAIN.id
                    ? `${ESCROW_CHAIN.name} · ready`
                    : `${chain?.name ?? 'Unknown network'} · switch before transacting`
                }
                address={browserAddress}
                copyKey="browser"
                copied={copied}
                onCopy={copyAddress}
              />
            )}
          </div>
          <p className="mt-5 text-[9px] leading-4 text-[color:var(--text-faint)]">
            Pokter does not create a username/password profile or hold your
            private keys. Account data shown here is derived from connected
            wallets, signed builder verification and this device, and your
            avatar is generated from the address rather than uploaded.
          </p>
        </section>

        <aside>
          <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5">
            <h2 className="text-sm font-semibold">Quick access</h2>
            <div className="mt-3 grid gap-1 text-[11px]">
              {[
                ['/discover', 'Find an agent'],
                ['/compare', 'Compare saved agents'],
                ['/activity', 'Jobs and notifications'],
                ['/builder', builderReady ? 'Builder alerts' : 'My agents'],
              ].map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-[var(--radius)] px-3 py-2.5 hover:bg-[color:var(--surface-hover)]"
                >
                  {label} <span className="float-right">→</span>
                </Link>
              ))}
            </div>
          </div>

          {/*
            The campaign sits here, below the account's own controls, rather
            than as a third of the page above them. It is something you are
            doing with Pokter, not a property of who you are.
          */}
          <CampaignAccountRow />
        </aside>
      </div>

      <BuilderSection address={address ?? null} />
    </div>
  );
}
