'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { formatEther, formatUnits, parseUnits } from 'viem';

import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { NATIVE_SYMBOL, FAUCETS } from '@/lib/network/presentation';
import { setWalletMode, useWalletMode, type WalletMode } from '@/lib/wallet/mode';
import {
  connectExternalWallet,
  externalBalances,
  hasInjectedWallet,
} from '@/lib/wallet/external';
import { shortAddress } from '@/lib/ui/format';
import { DEFAULT_BUDGET_U } from '@/lib/erc8183/pricing';

const MIN_GAS = parseUnits('0.002', 18);

function Amount({
  label,
  value,
  symbol,
  enough,
}: {
  label: string;
  value: string | null;
  symbol: string;
  enough: boolean | null;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
        {label}
      </span>
      <span
        className="tabular truncate text-[13px] font-semibold"
        style={
          enough === null
            ? undefined
            : { color: enough ? 'var(--positive)' : 'var(--caution)' }
        }
      >
        {value === null ? '—' : `${value} ${symbol}`}
      </span>
    </div>
  );
}

/**
 * One wallet control for both kinds of wallet.
 *
 * Hiring had two panels that did the same job in different words — the passkey
 * flow inside the wallet gate, and an external-wallet panel underneath it — so
 * choosing between them meant reading rather than switching, and the
 * commission form only ever spoke to one. This is the switch, and it shows the
 * same three things whichever side is active: the address, the gas balance and
 * the budget balance.
 *
 * Both balances are shown because both can block a hire and they run out
 * independently. Finding out mid-sequence that the gas token is short is the
 * worst moment to learn it.
 */
export function WalletStrip({
  budgetU = DEFAULT_BUDGET_U,
}: {
  budgetU?: number;
}) {
  const mode = useWalletMode();
  const { wallet } = usePasskeyWallet();
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentToken = correctedErc8183Addresses(WALLET_NETWORK.chainId)
    .paymentToken;

  const injected = hasInjectedWallet();

  const passkeyBalance = useQuery({
    queryKey: ['strip-passkey', wallet?.address, paymentToken],
    queryFn: () =>
      walletClient().balances({
        wallet: wallet!.address,
        tokens: [paymentToken],
      }),
    enabled: mode === 'passkey' && Boolean(wallet),
    refetchInterval: 30_000,
  });

  const external = useQuery({
    queryKey: ['strip-external'],
    queryFn: () => externalBalances(),
    enabled: mode === 'external' && injected,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const address =
    mode === 'passkey' ? wallet?.address : external.data?.address ?? null;

  const native =
    mode === 'passkey'
      ? passkeyBalance.data?.native ?? null
      : external.data?.native ?? null;

  const payment =
    mode === 'passkey'
      ? passkeyBalance.data?.tokens?.[0]?.ok
        ? passkeyBalance.data.tokens[0].raw
        : null
      : external.data?.payment ?? null;

  const budgetRaw = parseUnits(String(budgetU), 18);

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const connect = async () => {
    setError(null);
    setConnecting(true);
    try {
      await connectExternalWallet();
      await external.refetch();
    } catch (caught) {
      setError(
        (caught as Error)?.message === 'WRONG_CHAIN'
          ? `Switch your wallet to chain ${WALLET_NETWORK.chainId} and try again.`
          : 'Could not connect to the wallet extension.',
      );
    } finally {
      setConnecting(false);
    }
  };

  const choose = (next: WalletMode) => {
    setError(null);
    setWalletMode(next);
  };

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/*
          A switch, not a pair of panels. It stays visible in both modes so
          somebody who picked the wrong one can see that they did.
        */}
        <div
          role="radiogroup"
          aria-label="Wallet to hire with"
          className="flex gap-1 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-1"
        >
          {(
            [
              ['passkey', 'Passkey wallet'],
              ['external', 'My own wallet'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => choose(id)}
              disabled={id === 'external' && !injected}
              title={
                id === 'external' && !injected
                  ? 'No browser wallet detected in this browser.'
                  : undefined
              }
              className={
                mode === id
                  ? 'rounded-[calc(var(--radius)-2px)] bg-[color:var(--surface)] px-3 py-1.5 text-[12px] font-medium shadow-sm'
                  : 'rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-[12px] text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text)] disabled:opacity-40'
              }
            >
              {label}
            </button>
          ))}
        </div>

        {address ? (
          <button
            type="button"
            onClick={copy}
            className="mono inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[color:var(--border)] px-2.5 py-1.5 text-[11px] text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]"
          >
            {shortAddress(address)}
            <span className="text-[color:var(--text-faint)]">
              {copied ? '✓ copied' : 'copy'}
            </span>
          </button>
        ) : mode === 'external' ? (
          <button
            type="button"
            onClick={connect}
            disabled={connecting || !injected}
            className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
          >
            {connecting ? 'Connecting…' : 'Connect wallet'}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-[var(--radius)] bg-[color:var(--bg-subtle)] p-3">
        <Amount
          label="Gas"
          value={native === null ? null : Number(formatEther(native)).toFixed(4)}
          symbol={NATIVE_SYMBOL}
          enough={native === null ? null : native >= MIN_GAS}
        />
        <Amount
          label="Budget"
          value={
            payment === null ? null : Number(formatUnits(payment, 18)).toFixed(2)
          }
          symbol="$U"
          enough={payment === null ? null : payment >= budgetRaw}
        />
      </div>

      {error && (
        <p className="text-[11px] text-[color:var(--negative)]">{error}</p>
      )}

      {/*
        The faucets, where the balance is the thing stopping a hire. Null on
        mainnet, where offering free funds would be a lie.
      */}
      {FAUCETS &&
        ((native !== null && native < MIN_GAS) ||
          (payment !== null && payment < budgetRaw)) && (
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[color:var(--text-muted)]">
            <span>Top up:</span>
            <a
              href={FAUCETS.native}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[color:var(--info)] underline decoration-dotted"
            >
              {NATIVE_SYMBOL} faucet ↗
            </a>
            <a
              href={FAUCETS.paymentToken}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[color:var(--info)] underline decoration-dotted"
            >
              $U faucet ↗
            </a>
          </p>
        )}
    </section>
  );
}
