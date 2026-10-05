'use client';

import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, parseEther, type Address } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

/** Enough to mint an identity and write its profile, with room for a retry. */
export const MIN_REGISTRATION_GAS = parseEther('0.002');

export type ChainFunding = {
  /** null while unknown — not the same as zero, and must not be drawn as it. */
  funded: boolean | null;
  balance: bigint | null;
};

/**
 * Whether a wallet can pay for a transaction on each identity chain.
 *
 * Read for both chains at once because the choice between them is made in
 * one control: a builder picking where to publish is really asking which
 * one they can afford, and answering that for only the selected chain
 * makes them switch to find out.
 *
 * Unknown is carried through rather than collapsed into false. Drawing an
 * unfunded warning over a request still in flight tells somebody to go and
 * find a faucet they may not need.
 */
export function useChainFunding(address: Address | null | undefined): {
  56: ChainFunding;
  97: ChainFunding;
} {
  const read = useQuery({
    queryKey: ['identity-chain-funding', address],
    enabled: Boolean(address),
    refetchInterval: 30_000,
    queryFn: async () => {
      const balances = await Promise.all(
        ([bsc, bscTestnet] as const).map((chain) =>
          createPublicClient({ chain, transport: http() })
            .getBalance({ address: address! })
            .catch(() => null),
        ),
      );
      return { 56: balances[0], 97: balances[1] };
    },
  });

  const at = (chainId: 56 | 97): ChainFunding => {
    const balance = read.data?.[chainId] ?? null;
    if (!read.isSuccess || balance === null) return { funded: null, balance: null };
    return { funded: balance >= MIN_REGISTRATION_GAS, balance };
  };

  return { 56: at(56), 97: at(97) };
}
