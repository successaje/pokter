import 'server-only';

import type { Erc8183Job, NetworkConfig } from '@altananetwork/sdk';
import { createPublicClient, getAddress, type Address } from 'viem';

import { readTransport } from '@/lib/chain/rpc';
import { readUrlsKeeping } from '@/lib/chain/transport';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { readErc8183Job } from '@/lib/erc8183/get-job';

/**
 * The SDK's `getErc8183Job`, read through several nodes instead of one.
 *
 * The SDK builds its client from `network.publicRpcUrl` alone, so every
 * server read of a job asked bsc-rpc.publicnode.com and nothing else. On
 * 1 November a read of job 56975 timed out there, `/api/jobs/56975?chain=56`
 * answered 502, and a release's escrow check failed, though the release
 * itself was fine.
 *
 * Same arguments, same answer, `statusName` included, so a server call
 * site changes only where it imports from. The browser has its own
 * (`job-read-browser.ts`): NodeReal's key never reaches it, and it asks the
 * nodes its hires already use.
 */
type JobClient = ReturnType<typeof createPublicClient>;
const clients = new Map<number, JobClient>();

function jobClient(network: NetworkConfig): JobClient {
  const known = clients.get(network.chainId);
  if (known) return known;
  /* An operator's own node is a mainnet node, as it is for the escrow index. */
  const urls = readUrlsKeeping(network.chainId, network.publicRpcUrl, network.chainId === 56 ? process.env.BSC_MAINNET_RPC_URL : undefined);
  const client = createPublicClient({ chain: network.chain, transport: readTransport(network.chainId, urls) });
  clients.set(network.chainId, client);
  return client;
}

export async function getErc8183Job(network: NetworkConfig, jobId: bigint): Promise<Erc8183Job> {
  return readErc8183Job(jobClient(network), getAddress(correctedErc8183Addresses(network.chainId).commerce) as Address, jobId);
}
