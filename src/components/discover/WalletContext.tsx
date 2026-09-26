'use client';

import { useQuery } from '@tanstack/react-query';
import { formatEther, formatUnits } from 'viem';

import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { NETWORK_LABEL, NATIVE_SYMBOL } from '@/lib/network/presentation';
import { shortAddress } from '@/lib/ui/format';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';

/** Hiring-wallet context without confusing escrow funds with portfolio capital. */
export function DiscoverWalletContext() {
  const { wallet, ready } = usePasskeyWallet();
  const paymentToken = correctedErc8183Addresses(
    WALLET_NETWORK.chainId,
  ).paymentToken;
  const balances = useQuery({
    queryKey: ['passkey-readiness', wallet?.address, paymentToken],
    queryFn: () =>
      walletClient().balances({
        wallet: wallet!.address,
        tokens: [paymentToken],
      }),
    enabled: Boolean(wallet),
    refetchInterval: 30_000,
  });

  const token = balances.data?.tokens?.[0];

  return (
    <aside className="flex flex-col gap-2 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-faint)]">
          Hiring wallet
        </span>
        {!ready ? (
          <span className="text-[11px] text-[color:var(--text-muted)]">
            Checking this device…
          </span>
        ) : wallet ? (
          <span className="mono text-[11px] text-[color:var(--text-secondary)]">
            {shortAddress(wallet.address)} · {NETWORK_LABEL}
          </span>
        ) : (
          <span className="text-[11px] text-[color:var(--text-muted)]">
            Not connected · discovery remains public
          </span>
        )}
        <span className="text-[10px] text-[color:var(--text-faint)]">
          Gas and escrow only · separate from portfolio capital
        </span>
      </div>

      {wallet ? (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]"
          aria-live="polite"
        >
          {balances.isPending ? (
            <span className="text-[color:var(--text-faint)]">Reading balances…</span>
          ) : balances.isError ? (
            <button
              type="button"
              onClick={() => balances.refetch()}
              className="text-[color:var(--caution)] underline decoration-dotted underline-offset-2"
            >
              Balance unavailable · retry
            </button>
          ) : (
            <>
              <span className="tabular text-[color:var(--text-secondary)]">
                {balances.data
                  ? Number(formatEther(balances.data.native)).toFixed(4)
                  : '—'}{' '}
                {NATIVE_SYMBOL}
              </span>
              <span className="tabular text-[color:var(--text-secondary)]">
                {token?.ok
                  ? Number(formatUnits(token.raw, token.decimals)).toFixed(2)
                  : '—'}{' '}
                $U
              </span>
            </>
          )}
        </div>
      ) : (
        <span className="text-[10px] leading-relaxed text-[color:var(--text-faint)] sm:max-w-64 sm:text-right">
          Connect in the header to preview gas and escrow funds.
        </span>
      )}
    </aside>
  );
}
