'use client';

import { useAccount, useConnect } from 'wagmi';

import { ESCROW_CHAIN } from '@/lib/wallet/config';

/**
 * Gates the actions that spend or delegate.
 *
 * Browsing is public (§59); this wraps only the steps that commit something.
 * It also carries the honest caveat about *whose* key signs — see the note
 * below, which is displayed rather than buried in a doc.
 */
export function WalletGate({
  action,
  children,
}: {
  /** What the user is about to do, named in the prompt. */
  action: string;
  children: React.ReactNode;
}) {
  const { isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();

  const injected = connectors.find((c) => c.id === 'injected') ?? connectors[0];
  const wrongChain = isConnected && chain?.id !== ESCROW_CHAIN.id;

  if (!isConnected) {
    return (
      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] p-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Connect a wallet to {action}</p>
          <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
            Discovery, evidence and rankings stay public. A wallet is only needed
            once you are about to commit something.
          </p>
        </div>
        <button
          type="button"
          disabled={isPending || !injected}
          onClick={() => injected && connect({ connector: injected })}
          className="w-fit rounded-[var(--radius)] bg-[color:var(--text)] px-4 py-2 text-[13px] font-medium text-[color:var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Connecting…' : 'Connect wallet'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {wrongChain && (
        <p className="rounded-[var(--radius)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-3 text-[11px] leading-relaxed text-[color:var(--caution)]">
          Your wallet is on {chain?.name ?? 'another network'}, but Pokter acts on{' '}
          {ESCROW_CHAIN.name}. Switch networks from the wallet menu before
          continuing.
        </p>
      )}

      {/*
        Stated in the interface, not just in docs. @altananetwork/sdk@0.8.0
        documents signerFromInjected but does not implement it, and browser
        wallets no longer expose the raw digest signing an Altana session needs.
        So the connected account identifies you and gates this step, while the
        transaction itself is still signed by Pokter's operator key on testnet.
      */}
      <p className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
        <span className="font-medium text-[color:var(--text-secondary)]">
          Signed by Pokter&apos;s testnet operator key, not your wallet.
        </span>{' '}
        The Altana SDK does not yet implement an injected-wallet signer, and
        browser wallets no longer expose the raw digest signing a session grant
        requires. Your connected account identifies you here; it does not yet
        hold the session.
      </p>

      {children}
    </div>
  );
}
