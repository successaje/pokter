'use client';

import { FAUCETS, NATIVE_SYMBOL } from '@/lib/network/presentation';
import { useQuery } from '@tanstack/react-query';
import { formatEther, formatUnits, parseEther, parseUnits } from 'viem';

import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import { shortAddress } from '@/lib/ui/format';

const MIN_GAS = parseEther('0.002');

export function WalletReadiness({ requiredBudgetU = 0.1 }: { requiredBudgetU?: number }) {
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
        <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
          Create or recover a passkey wallet to check gas and escrow funding before signing.
        </p>
      </section>
    );
  }

  const token = balance.data?.tokens?.[0];
  const native = balance.data?.native;
  const gasReady = native !== undefined && native >= MIN_GAS;
  const budgetRaw = parseUnits(String(requiredBudgetU), 18);
  const paymentReady = Boolean(token?.ok && token.raw >= budgetRaw);

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
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
        <div className="rounded-[var(--radius)] border border-[color:var(--border)] p-3">
          <p className="flex items-center justify-between gap-2 text-[11px]">
            <span>Transaction gas</span>
            <span style={{ color: gasReady ? 'var(--positive)' : 'var(--caution)' }}>
              {gasReady ? 'Ready' : `Needs ${NATIVE_SYMBOL}`}
            </span>
          </p>
          <p className="mono mt-1 text-[12px]">
            {native === undefined
              ? '—'
              : `${Number(formatEther(native)).toFixed(4)} ${NATIVE_SYMBOL}`}
          </p>
          {!gasReady &&
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

        <div className="rounded-[var(--radius)] border border-[color:var(--border)] p-3">
          <p className="flex items-center justify-between gap-2 text-[11px]">
            <span>Escrow budget</span>
            <span style={{ color: paymentReady ? 'var(--positive)' : 'var(--caution)' }}>
              {paymentReady ? 'Ready' : 'Needs $U'}
            </span>
          </p>
          <p className="mono mt-1 text-[12px]">
            {token?.ok ? `${Number(formatUnits(token.raw, token.decimals)).toFixed(3)} $U` : '—'}
          </p>
          {!paymentReady &&
            (FAUCETS ? (
              <a
                href={FAUCETS.paymentToken}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-block text-[10px] text-[color:var(--info)] underline decoration-dotted"
              >
                Get at least {requiredBudgetU} testnet $U ↗
              </a>
            ) : (
              <p className="mt-2 text-[10px] text-[color:var(--text-muted)]">
                This wallet needs at least {requiredBudgetU} $U to fund the escrow.
              </p>
            ))}
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
        Session authorization only needs {NATIVE_SYMBOL}. Commissioning also
        needs the selected $U budget.
      </p>
    </section>
  );
}
