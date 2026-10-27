import 'server-only';

import { getAddress, parseAbi, type Address } from 'viem';

import { withPublicEndpoint } from '@/lib/proof/prober';
import { registryAddress, registryClient, registryTokenUri } from '@/lib/registry/onchain';
import { registeredServiceEndpoint, registrationFromDataUri } from '@/lib/x402/endpoint';

/**
 * What the ERC-8004 registry itself says about an agent, read when the
 * indexer's copy is missing a field a quote needs.
 *
 * A quote request stopped at the indexer's row: no A2A endpoint, or no
 * agent wallet, and Pokter reported the agent as unreachable without
 * reading the registration it was looking at a copy of. An agent
 * registered or updated since the indexer last read it lost its quote for
 * as long as the copy was stale.
 *
 * The wallet is the registry's own `getAgentWallet`, the one the agent's
 * owner set on chain. Never the NFT owner, and never a wallet an agent
 * names about itself: a quote is only ever checked against this one.
 *
 * Bounded: one RPC call and at most one fetch of the registration file,
 * each with a timeout, and the result kept for a while so a sweep does not
 * re-read the same agent on every pass.
 */
export interface LiveAgentFields {
  a2aEndpoint: string | null;
  agentWallet: Address | null;
}

const AGENT_WALLET_ABI = parseAbi(['function getAgentWallet(uint256) view returns (address)']);
const REGISTRATION_LIMIT = 64 * 1024;
const HIT_TTL_MS = 30 * 60_000;
const MISS_TTL_MS = 10 * 60_000;
const CACHE_LIMIT = 1_000;
const cache = new Map<string, { fields: LiveAgentFields; at: number }>();

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > REGISTRATION_LIMIT) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

async function registeredWallet(chainId: number, tokenId: string): Promise<Address | null> {
  const client = registryClient(chainId);
  const address = registryAddress(chainId);
  if (!client || !address) return null;
  try {
    const wallet = (await client.readContract({ address, abi: AGENT_WALLET_ABI, functionName: 'getAgentWallet', args: [BigInt(tokenId)] })) as Address;
    return /^0x0{40}$/i.test(wallet) ? null : getAddress(wallet);
  } catch {
    return null;
  }
}

async function registeredA2a(chainId: number, tokenId: string): Promise<string | null> {
  const uri = await registryTokenUri(chainId, tokenId);
  if (!uri) return null;
  const inline = registrationFromDataUri(uri);
  if (inline) return registeredServiceEndpoint(inline, 'a2a');
  if (!uri.startsWith('https://')) return null;
  return withPublicEndpoint(uri, async (service) => {
    const response = await service.fetch({ headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(6_000) });
    if (!response.ok) return null;
    return registeredServiceEndpoint(await boundedJson(response), 'a2a');
  }).catch(() => null);
}

export async function liveAgentFields(chainId: number, tokenId: string, now = Date.now()): Promise<LiveAgentFields> {
  if (!/^\d+$/.test(tokenId)) return { a2aEndpoint: null, agentWallet: null };
  const key = `${chainId}:${tokenId}`;
  const known = cache.get(key);
  const found = known && (known.fields.a2aEndpoint || known.fields.agentWallet);
  if (known && now - known.at < (found ? HIT_TTL_MS : MISS_TTL_MS)) return known.fields;
  const [agentWallet, a2aEndpoint] = await Promise.all([registeredWallet(chainId, tokenId), registeredA2a(chainId, tokenId)]);
  const fields = { a2aEndpoint, agentWallet };
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, { fields, at: now });
  return fields;
}
