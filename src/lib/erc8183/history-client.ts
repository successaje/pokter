import 'server-only';

import { createPublicClient, fallback, http } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

/**
 * A client for reading old logs: where a job's deliverable URL is found.
 *
 * The URL lives in the log the escrow wrote when the agent submitted, and
 * public BSC nodes refuse a log query more than about an hour old ("Invalid
 * parameters were provided to the RPC method", "Request exceeds defined
 * limit", "Block could not be found": checked against eight public nodes on
 * 22 October). Any mainnet delivery Pokter did not catch within that hour
 * could then never be read, and the job page showed the node's error: job
 * 56:57001, submitted 15 October.
 *
 * NodeReal serves history, so it is asked first when NODEREAL_API_KEY is set,
 * with the public node behind it. Without the key this is the public node
 * alone, as before.
 */
const PUBLIC: Record<56 | 97, string> = {
  56: process.env.BSC_MAINNET_RPC_URL ?? 'https://bsc-rpc.publicnode.com',
  97: 'https://bsc-testnet-rpc.publicnode.com',
};

export function historyClient(chainId: 56 | 97) {
  const key = process.env.NODEREAL_API_KEY?.trim();
  const transports = [
    ...(key ? [http(`https://bsc-${chainId === 56 ? 'mainnet' : 'testnet'}.nodereal.io/v1/${key}`)] : []),
    http(PUBLIC[chainId]),
  ];
  return createPublicClient({ chain: chainId === 56 ? bsc : bscTestnet, transport: fallback(transports) });
}
