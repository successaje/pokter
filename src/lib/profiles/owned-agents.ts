import 'server-only';

import { getAddress } from 'viem';

import { registryOwner } from '@/lib/registry/onchain';
import { listAgents } from '@/lib/scan/client';

/** Indexed candidates are checked against current registry ownership before use. */
export async function verifiedOwnedAgents(wallet: string): Promise<Array<{ key: string; name: string }>> {
  const owner = getAddress(wallet);
  const pages = await Promise.all([56, 97].map((chainId) => listAgents({ chainId: chainId as 56 | 97, ownerAddress: owner, limit: 100 }).catch(() => null)));
  const candidates = pages.flatMap((page) => page?.items ?? []).map((agent) => ({ key: `${agent.chain_id}:${agent.token_id}`, name: agent.name }));
  const owners = await Promise.all(candidates.map(({ key }) => {
    const [chain, token] = key.split(':');
    return registryOwner(Number(chain), token).catch(() => null);
  }));
  return candidates.filter((_, index) => owners[index] === owner);
}
