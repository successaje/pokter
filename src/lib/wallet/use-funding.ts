'use client';

import { useQuery } from '@tanstack/react-query';
import { parseEther, parseUnits, type Address } from 'viem';

import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';

/** Enough for an approval and a fund call, with room for a retry. */
export const MIN_GAS = parseEther('0.002');

/**
 * Whether a wallet can actually pay for a job, as one answer.
 *
 * The readiness panel worked this out and so did the hire form, from two
 * copies of the same query and the same thresholds. Two copies of a rule
 * about money is one rule and one bug waiting, so both now read this.
 *
 * `known` is the part callers most need and most easily forget: until the
 * balances resolve, "not funded" and "we have not looked yet" are the same
 * shape, and showing somebody a faucet because a request is in flight is
 * the same mistake as showing it when they are already funded.
 */
export function useWalletFunding(
  address: Address | null | undefined,
  requiredBudgetU: number,
) {
  const paymentToken = correctedErc8183Addresses(
    WALLET_NETWORK.chainId,
  ).paymentToken;

  const balance = useQuery({
    queryKey: ['wallet-funding', address, paymentToken, requiredBudgetU],
    queryFn: () =>
      walletClient().balances({ wallet: address!, tokens: [paymentToken] }),
    enabled: Boolean(address),
    refetchInterval: 30_000,
  });

  const token = balance.data?.tokens?.[0];
  const native = balance.data?.native;
  const budgetRaw = parseUnits(String(requiredBudgetU), 18);

  const gasKnown = balance.isSuccess && native !== undefined;
  const paymentKnown = balance.isSuccess && Boolean(token?.ok);
  const gasReady = native !== undefined && native >= MIN_GAS;
  const paymentReady = Boolean(token?.ok && token.raw >= budgetRaw);

  return {
    connected: Boolean(address),
    known: gasKnown && paymentKnown,
    gasKnown,
    paymentKnown,
    gasReady,
    paymentReady,
    gasLow: gasKnown && !gasReady,
    paymentLow: paymentKnown && !paymentReady,
    allReady: gasReady && paymentReady,
    native,
    token,
    budgetRaw,
    query: balance,
  };
}
