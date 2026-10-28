import 'server-only';

import { createPublicClient, http, type Address } from 'viem';

import { altanaNetworkFor } from '@/lib/altana/client';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';

/**
 * The escrow's own platform fee, read from the commerce contract.
 *
 * Pokter charges nothing, but "free" is not Pokter's to promise for the
 * escrow: the ERC-8183 commerce contract on both chains carries a
 * `platformFeeBP` its admin can set, up to `MAX_PLATFORM_FEE_BP`. Both
 * read 0 and 1000 (10%) on 27 Oct 2026. So the guides say what the
 * contract says when the page is read, and say so when it cannot be read,
 * rather than writing down a zero that someone else can change.
 *
 * Cached for ten minutes, not for the process: unlike the dispute window,
 * this is a setting, and a page that kept saying 0% for days after it
 * changed would be the false claim this exists to avoid.
 */
const ABI = [
  { name: 'platformFeeBP', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'MAX_PLATFORM_FEE_BP', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

export interface PlatformFee {
  chainId: number;
  /** Basis points: 100 is 1%. */
  feeBp: number;
  maxBp: number;
}

const TTL_MS = 10 * 60_000;
const cache = new Map<number, { at: number; fee: PlatformFee }>();

export async function escrowPlatformFee(chainId: number, now = Date.now()): Promise<PlatformFee> {
  const known = cache.get(chainId);
  if (known && now - known.at < TTL_MS) return known.fee;
  const network = altanaNetworkFor(chainId);
  const client = createPublicClient({ chain: network.chain, transport: http(network.publicRpcUrl) });
  const address = correctedErc8183Addresses(chainId).commerce as Address;
  const [fee, max] = await Promise.all([
    client.readContract({ address, abi: ABI, functionName: 'platformFeeBP' }),
    client.readContract({ address, abi: ABI, functionName: 'MAX_PLATFORM_FEE_BP' }),
  ]);
  const read = { chainId, feeBp: Number(fee), maxBp: Number(max) };
  cache.set(chainId, { at: now, fee: read });
  return read;
}
