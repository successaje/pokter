'use client';

import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';

import { walletClient } from '@/lib/wallet/passkey';

/** Thrown when Pokter would not or could not cover the fee; the message is for the user. */
export class SponsorshipRefused extends Error {}

/** Whether a hire here can be one signature. Cached for the session. */
export function useGasSponsorship(): boolean {
  const query = useQuery({
    queryKey: ['gas-sponsorship'],
    queryFn: async () => {
      const response = await fetch('/api/wallet/sponsor-gas', { cache: 'force-cache' });
      if (!response.ok) return false;
      const body = (await response.json()) as { available?: boolean };
      return Boolean(body.available);
    },
    staleTime: 5 * 60_000,
  });
  return query.data === true;
}

/**
 * Make sure `address` can pay for its next signature, asking Pokter to cover
 * the fee when it cannot. Resolves 'held' when nothing was needed and
 * 'sponsored' once the top-up has landed; throws SponsorshipRefused with the
 * server's reason otherwise, so the caller can fall back to its own message.
 */
export async function ensureGas(address: Address, minimum: bigint, native?: bigint): Promise<'held' | 'sponsored'> {
  const current = native ?? (await walletClient().balances({ wallet: address })).native;
  if (current >= minimum) return 'held';

  const response = await fetch('/api/wallet/sponsor-gas', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  const body = (await response.json().catch(() => ({}))) as { status?: string; reason?: string };
  if (body.status === 'held') return 'held';
  if (body.status !== 'funded') throw new SponsorshipRefused(body.reason ?? 'The network fee could not be covered.');

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const { native: balance } = await walletClient().balances({ wallet: address });
    if (balance >= minimum) return 'sponsored';
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new SponsorshipRefused('The fee top-up was sent but has not landed yet. Try again in a moment.');
}
