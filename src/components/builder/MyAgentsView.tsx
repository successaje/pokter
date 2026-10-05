'use client';

import Link from 'next/link';

import { BuilderSection } from '@/components/account/BuilderSection';
import { useActiveWallet } from '@/lib/wallet/active';

/**
 * "My agents" for anyone who has not verified ownership.
 *
 * This page used to answer a signed-out visitor with a wall: sign in, prove
 * you own your listings, then you may look at them. That is the wrong trade
 * for reading. Who owns an ERC-8004 identity is public and printed on every
 * agent page, so the list proves nothing a stranger could not already read
 * off the registry — and the proof it demanded is one a passkey holder
 * cannot produce at all, which meant the builders this product most wants
 * were the ones it locked out of their own work.
 *
 * So the list is shown to whoever is connected, and verifying is offered for
 * what it actually unlocks: the operational dashboard, the job inbox, and
 * acting on any of it.
 */
export function MyAgentsView() {
  const { address, mode } = useActiveWallet();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16 pt-8 sm:pt-12">
      <header className="flex flex-col gap-3">
        <p className="mono text-[10px] uppercase tracking-[0.17em] text-[color:var(--brand-strong)]">
          Building
        </p>
        <h1 className="font-[family-name:var(--font-serif)] text-3xl tracking-tight sm:text-4xl">
          My agents
        </h1>
        <p className="max-w-xl text-[13px] leading-6 text-[color:var(--text-secondary)]">
          Everything published from the wallet you are signed in with, and
          every draft still saved on this device.
        </p>
      </header>

      {!address && (
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5">
          <p className="text-[13px] font-medium">Connect a wallet to see your agents.</p>
          <p className="mt-2 text-[12px] leading-5 text-[color:var(--text-secondary)]">
            A passkey works for this — it takes a touch and no extension. Drafts
            you have already started appear below either way, because they live
            in this browser rather than on a chain.
          </p>
        </div>
      )}

      {/*
        Drafts render even with nothing connected, which is why this is not
        inside the branch above: somebody part-way through their first agent
        has no wallet yet by definition, and losing sight of the draft is the
        one thing that would make them start over.
      */}
      <BuilderSection address={address} standalone />

      <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] p-5">
        <h2 className="text-sm font-semibold">Operations and job inbox</h2>
        <p className="mt-2 text-[12px] leading-5 text-[color:var(--text-secondary)]">
          Uptime, escrowed jobs, delivery and earnings sit behind a signature
          proving this wallet owns its listings. Verifying is a signature, not
          a transaction: it costs no gas and grants Pokter no control over the
          wallet or its agents.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/build"
            className="action-primary rounded-[var(--radius)] px-4 py-2.5 text-[12px] font-semibold"
          >
            Verify ownership
          </Link>
          {address && (
            <Link
              href={`/builders/${address}`}
              className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 py-2.5 text-[11px] font-medium hover:bg-[color:var(--surface-hover)]"
            >
              View public profile ↗
            </Link>
          )}
        </div>
        {mode === 'passkey' && (
          <p className="mt-3 text-[11px] leading-5 text-[color:var(--text-muted)]">
            A passkey cannot produce this signature — it signs with a different
            curve than the registry checks against. Connect the browser wallet
            that holds the listings to reach operations.
          </p>
        )}
        <p className="mt-3 text-[11px] leading-5 text-[color:var(--text-muted)]">
          On the launchpad, choose{' '}
          <span className="text-[color:var(--text-secondary)]">
            “An agent already registered onchain”
          </span>
          .
        </p>
      </section>
    </div>
  );
}
