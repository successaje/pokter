import 'server-only';

import { agentIdentityKey } from '@/lib/agents/distinct';
import { listAgents } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';

/** The same agent's own registration on another chain, if its owner registered it there under the same name. */
export async function ownRegistration(on: number, owner: string, name: string, chainId: number, tokenId: string): Promise<{ chainId: number; tokenId: string } | null> {
  const key = agentIdentityKey({ owner_address: owner, name, chain_id: chainId, token_id: tokenId });
  if (key === `${chainId}:${tokenId}`) return null;
  const page = await listAgents({ chainId: on as ChainId, ownerAddress: owner, limit: 100 }).catch(() => null);
  const twin = page?.items.find((a) => agentIdentityKey(a) === key);
  return twin ? { chainId: twin.chain_id, tokenId: twin.token_id } : null;
}
