import { createPublicClient, getAddress, http, parseAbi, type Address } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { IDENTITY_REGISTRY } from '@/lib/reviews/onchain';

/**
 * Reads of the ERC-8004 identity registry that cannot wait for an indexer.
 *
 * 8004scan is Pokter's catalogue source and is the right one for anything
 * it has already indexed. It is the wrong one the moment an agent has just
 * been registered: the row does not exist yet, so the builder who paid for
 * the mint thirty seconds ago is told their identity "could not be read".
 * Ownership is also the one fact worth paying an RPC call for — it decides
 * who may manage an agent, and the registry is where it is decided.
 */

export const REGISTRY_ABI = parseAbi([
  'function ownerOf(uint256) view returns (address)',
  'function tokenURI(uint256) view returns (string)',
]);

const NETWORK: Record<number, { chain: typeof bsc | typeof bscTestnet; url: string }> = {
  56: { chain: bsc, url: process.env.BSC_MAINNET_RPC_URL ?? 'https://bsc-rpc.publicnode.com' },
  97: { chain: bscTestnet, url: 'https://bsc-testnet-rpc.publicnode.com' },
};

export function registryClient(chainId: number) {
  const network = NETWORK[chainId];
  if (!network) return null;
  return createPublicClient({ chain: network.chain, transport: http(network.url) });
}

export function registryAddress(chainId: number): Address | null {
  return IDENTITY_REGISTRY[chainId] ?? null;
}

async function read<T>(chainId: number, tokenId: string, functionName: 'ownerOf' | 'tokenURI'): Promise<T | null> {
  const client = registryClient(chainId);
  const address = registryAddress(chainId);
  if (!client || !address || !/^\d+$/.test(tokenId)) return null;
  try {
    return (await client.readContract({
      address,
      abi: REGISTRY_ABI,
      functionName,
      args: [BigInt(tokenId)],
    })) as T;
  } catch {
    return null;
  }
}

/** The wallet the registry says owns this identity, now. */
export async function registryOwner(chainId: number, tokenId: string): Promise<Address | null> {
  const owner = await read<Address>(chainId, tokenId, 'ownerOf');
  try {
    return owner ? getAddress(owner) : null;
  } catch {
    return null;
  }
}

export function registryTokenUri(chainId: number, tokenId: string): Promise<string | null> {
  return read<string>(chainId, tokenId, 'tokenURI');
}
