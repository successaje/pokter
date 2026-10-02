'use client';

import { FAUCETS, NATIVE_SYMBOL } from '@/lib/network/presentation';
import { DEFAULT_BUDGET_U, formatBudget } from '@/lib/erc8183/pricing';
import { useQuery } from '@tanstack/react-query';
import { formatEther, formatUnits, parseEther, parseUnits } from 'viem';

import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import { shortAddress } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';

const MIN_GAS = parseEther('0.002');

export function WalletReadiness({ requiredBudgetU = DEFAULT_BUDGET_U }: { requiredBudgetU?: number }) {
  const { wallet } = usePasskeyWallet();
  const paymentToken = correctedErc8183Addresses(WALLET_NETWORK.chainId).paymentToken;
  const balance = useQuery({
    queryKey: ['passkey-readiness', wallet?.address, paymentToken],
    queryFn: () =>
      walletClient().balances({
        wallet: wallet!.address,
        tokens: [paymentToken],
      }),
    enabled: Boolean(wallet),
    refetchInterval: 30_000,
  });

  if (!wallet) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] p-4">
        <h2 className="text-xs font-medium">Wallet readiness</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
          Connect a wallet — a passkey on this device or your own browser
          wallet — to check gas and escrow funding before signing.
        </p>
      </section>
    );
  }

  const token = balance.data?.tokens?.[0];
  const native = balance.data?.native;
  const gasReady = native !== undefined && native >= MIN_GAS;
  const budgetRaw = parseUnits(String(requiredBudgetU), 18);
  const paymentReady = Boolean(token?.ok && token.raw >= budgetRaw);
  const gasKnown = balance.isSuccess && native !== undefined;
  const paymentKnown = balance.isSuccess && Boolean(token?.ok);
  const gasLow = gasKnown && !gasReady;
  const paymentLow = paymentKnown && !paymentReady;
  const gasAbundant = gasReady && native !== undefined && native >= MIN_GAS * 5n;
  const paymentAbundant = paymentReady && Boolean(token?.ok && token.raw >= budgetRaw * 3n);
  const allReady = gasReady && paymentReady;
  const anyLow = gasLow || paymentLow;
  const cardTone = (ready: boolean, low: boolean) =>
    ready
      ? 'border-[color:var(--positive)]/40 bg-[color:var(--positive-dim)]'
      : low
        ? 'border-[color:var(--negative)]/45 bg-[color:var(--negative-dim)]'
        : 'border-[color:var(--border)] bg-[color:var(--surface)]';

  return (
    <section className={cn(
      'flex flex-col gap-3 rounded-[var(--radius-lg)] border p-4 transition-colors',
      allReady
        ? 'border-[color:var(--positive)]/35 bg-[color:var(--positive-dim)]/35'
        : anyLow
          ? 'border-[color:var(--negative)]/40 bg-[color:var(--negative-dim)]/30'
          : 'border-[color:var(--border)] bg-[color:var(--surface)]',
    )}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-xs font-medium">Wallet readiness</h2>
          <p className="mono mt-0.5 text-[10px] text-[color:var(--text-faint)]">
            {shortAddress(wallet.address)} · chain {WALLET_NETWORK.chainId}
          </p>
        </div>
        <button
          type="button"
          onClick={() => balance.refetch()}
          disabled={balance.isFetching}
          className="rounded-[var(--radius)] border border-[color:var(--border)] px-2.5 py-1 text-[10px] transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
        >
          {balance.isFetching ? 'Checking…' : 'Refresh balances'}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className={cn('rounded-[var(--radius)] border p-3 transition-colors', cardTone(gasReady, gasLow))}>
          <p className="flex items-center justify-between gap-2 text-[11px]">
            <span>Transaction gas</span>
            <span className={cn('font-medium', gasReady ? 'text-[color:var(--positive)]' : gasLow ? 'text-[color:var(--negative)]' : 'text-[color:var(--text-faint)]')}>
              {gasReady ? (gasAbundant ? 'Well funded' : 'Ready') : gasLow ? `Needs ${NATIVE_SYMBOL}` : 'Checking'}
            </span>
          </p>
          <p className="mono mt-1 text-[12px]">
            {native === undefined
              ? '—'
              : `${Number(formatEther(native)).toFixed(4)} ${NATIVE_SYMBOL}`}
          </p>
          {gasLow &&
            (FAUCETS ? (
              <a
                href={FAUCETS.native}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-block text-[10px] text-[color:var(--info)] underline decoration-dotted"
              >
                Fund with at least 0.002 {NATIVE_SYMBOL} ↗
              </a>
            ) : (
              /* No faucet exists on mainnet. Offering one would tell someone
                 their funds are free while they authorise real money. */
              <p className="mt-2 text-[10px] text-[color:var(--text-muted)]">
                Send at least 0.002 {NATIVE_SYMBOL} to this wallet to cover gas.
              </p>
            ))}
        </div>

        <div className={cn('rounded-[var(--radius)] border p-3 transition-colors', cardTone(paymentReady, paymentLow))}>
          <p className="flex items-center justify-between gap-2 text-[11px]">
            <span>Escrow budget</span>
            <span className={cn('font-medium', paymentReady ? 'text-[color:var(--positive)]' : paymentLow ? 'text-[color:var(--negative)]' : 'text-[color:var(--text-faint)]')}>
              {paymentReady ? (paymentAbundant ? 'Well funded' : 'Ready') : paymentLow ? 'Needs $U' : 'Checking'}
            </span>
          </p>
          <p className="mono mt-1 text-[12px]">
            {token?.ok ? `${Number(formatUnits(token.raw, token.decimals)).toFixed(3)} $U` : '—'}
          </p>
          {paymentLow &&
            (FAUCETS ? (
              <a
                href={FAUCETS.paymentToken}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-block text-[10px] text-[color:var(--info)] underline decoration-dotted"
              >
                Get at least {requiredBudgetU.toFixed(2)} testnet $U ↗
              </a>
            ) : (
              <p className="mt-2 text-[10px] text-[color:var(--text-muted)]">
                This wallet needs at least {formatBudget(requiredBudgetU)} to fund the escrow.
              </p>
            ))}
        </div>
      </div>

      <p className="text-[12px] leading-relaxed text-[color:var(--text-faint)]">
        Session authorization only needs {NATIVE_SYMBOL}. Commissioning also
        needs the selected $U budget.
      </p>
    </section>
  );
}
