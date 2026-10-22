import {
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  createPublicClient,
  getAddress,
  http,
  parseAbi,
  type Address,
} from 'viem';
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

/**
 * The same read, saying whether the chain answered when it found nothing.
 *
 * `registryOwner` returns null for two unrelated things — this registry
 * holds no such identity, and the read never completed — and a caller that
 * has to tell a builder which one happened cannot. Separating them by
 * asking the node a second, cheaper question does not work: the thing that
 * fails is `eth_call` specifically, and a public endpoint whose eth_call is
 * rate limited, pruned or pointed at a sick backend will still answer
 * `eth_blockNumber` from cache. That probe reports a reachable chain and a
 * missing agent, so the owner of a real agent is told it does not exist —
 * the failure the 503 exists to prevent, arrived at from the other side.
 *
 * `ownerOf` on an unminted id **reverts**, and viem says so in the error
 * rather than in the absence of a result. A revert is the node telling us
 * it ran the call, which is the positive evidence wanted here and is about
 * the read that was actually made rather than about a different one.
 *
 * `answered: false` for everything else, including an error shape nobody
 * anticipated, so an unproven claim stays unproven and the caller refuses
 * with the 503 that grants nothing.
 */
export async function registryOwnerRead(
  chainId: number,
  tokenId: string,
): Promise<{ owner: Address | null; answered: boolean }> {
  const client = registryClient(chainId);
  const address = registryAddress(chainId);
  if (!client || !address || !/^\d+$/.test(tokenId)) return { owner: null, answered: false };
  try {
    const owner = (await client.readContract({
      address,
      abi: REGISTRY_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    })) as Address;
    return { owner: getAddress(owner), answered: true };
  } catch (error) {
    /*
     * A revert, or a call that returned no data for a function declared to
     * return an address: both are the contract's own answer to a question
     * it was asked, and neither is a transport fault.
     */
    const answered =
      error instanceof BaseError &&
      Boolean(
        error.walk((e) => e instanceof ContractFunctionRevertedError || e instanceof ContractFunctionZeroDataError),
      );
    return { owner: null, answered };
  }
}

export function registryTokenUri(chainId: number, tokenId: string): Promise<string | null> {
  return read<string>(chainId, tokenId, 'tokenURI');
}
