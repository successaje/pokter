import 'server-only';

import { createPublicClient, http, type Address } from 'viem';

import { altanaNetworkFor } from '@/lib/altana/client';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { DELIVERY_WINDOW_SECONDS, jobLifetimeSeconds } from '@/lib/erc8183/deadline';

const ABI = [{ name: 'disputeWindow', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] }] as const;
const cache = new Map<number, number>();

/** The escrow policy's dispute window on `chainId`, in seconds, read once per process. */
export async function disputeWindowSeconds(chainId: number): Promise<number> {
  const known = cache.get(chainId);
  if (known !== undefined) return known;
  const network = altanaNetworkFor(chainId);
  const client = createPublicClient({ chain: network.chain, transport: http(network.publicRpcUrl) });
  const window = Number(await client.readContract({ address: correctedErc8183Addresses(chainId).policy as Address, abi: ABI, functionName: 'disputeWindow' }));
  cache.set(chainId, window);
  return window;
}

/**
 * When a job was most likely funded, for a job Pokter has no record of.
 *
 * The chain records a job's deadline, not its funding. Pokter's deadline is
 * delivery time plus the escrow's dispute window, so the deadline minus that
 * is the funding moment. Jobs created before the window was added lived 24
 * hours: when "deadline minus 24 hours" is already past, that is the older
 * kind (or a new one in its last week, which this misdates; the index's own
 * `hiredAt` is preferred wherever there is one).
 *
 * It also assumes the standing 24-hour delivery window. A job funded from a
 * proposal with a longer delivery time is misdated here by the difference;
 * jobs hired through Pokter record their real `hiredAt`, so this only
 * reaches jobs Pokter never saw funded, and stays an estimate.
 */
export async function estimatedFundedAt(chainId: number, expiredAtSeconds: number, now = Date.now()): Promise<Date> {
  const legacy = (expiredAtSeconds - DELIVERY_WINDOW_SECONDS) * 1000;
  if (legacy <= now) return new Date(legacy);
  const lifetime = await disputeWindowSeconds(chainId)
    .then((window) => jobLifetimeSeconds(window))
    .catch(() => DELIVERY_WINDOW_SECONDS);
  return new Date(Math.min((expiredAtSeconds - lifetime) * 1000, now));
}
