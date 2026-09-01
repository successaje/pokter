'use client';

import { useState } from 'react';
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { formatEther } from 'viem';

import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { ESCROW_CHAIN } from '@/lib/wallet/config';

/**
 * §59. Wallet connection.
 *
 * Browsing never requires this — discovery, evidence, comparison and rankings
 * are all public. Connecting establishes who you are and which chain you are
 * on, which is what gates the actions that spend or delegate.
 */
export function ConnectWallet() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);

  const { data: balance } = useBalance({ address });

  const injected = connectors.find((c) => c.id === 'injected') ?? connectors[0];
  const wrongChain = isConnected && chain?.id !== ESCROW_CHAIN.id;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={isPending || !injected}
          onClick={() => injected && connect({ connector: injected })}
          className="rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
        >
          {isPending ? 'Connecting…' : 'Connect wallet'}
        </button>
        {error && (
          <span className="max-w-[220px] text-right text-[10px] leading-tight text-[color:var(--negative)]">
            {error.message.slice(0, 90)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 rounded-[var(--radius)] border px-3 py-1.5 text-[13px] transition-colors',
          wrongChain
            ? 'border-[color:var(--caution)]/40 bg-[color:var(--caution-dim)] text-[color:var(--caution)]'
            : 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] hover:bg-[color:var(--surface-hover)]',
        )}
      >
        <span
          aria-hidden
          className="size-1.5 rounded-full"
          style={{
            background: wrongChain ? 'var(--caution)' : 'var(--positive)',
          }}
        />
        <span className="mono">{shortAddress(address!)}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] p-3 shadow-xl">
          <dl className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--text-faint)]">Address</dt>
              <dd className="mono">{shortAddress(address!)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--text-faint)]">Network</dt>
              <dd className="mono">{chain?.name ?? 'unknown'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--text-faint)]">Balance</dt>
              <dd className="mono">
                {balance ? `${Number(formatEther(balance.value)).toFixed(4)} ${balance.symbol}` : '—'}
              </dd>
            </div>
          </dl>

          {wrongChain && (
            <div className="mt-3 flex flex-col gap-2 border-t border-[color:var(--border)] pt-3">
              <p className="text-[10px] leading-relaxed text-[color:var(--caution)]">
                Pokter escrows jobs on {ESCROW_CHAIN.name}. Switch to act there.
              </p>
              <button
                type="button"
                disabled={switching}
                onClick={() => switchChain({ chainId: ESCROW_CHAIN.id })}
                className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
              >
                {switching ? 'Switching…' : `Switch to ${ESCROW_CHAIN.name}`}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="mt-3 w-full rounded-[var(--radius)] border border-[color:var(--border)] px-2.5 py-1.5 text-[11px] transition-colors hover:bg-[color:var(--surface-hover)]"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
