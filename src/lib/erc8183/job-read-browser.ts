import type { Erc8183Job, NetworkConfig } from '@altananetwork/sdk';
import { createPublicClient, fallback, getAddress, http, type Address } from 'viem';

import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { readErc8183Job } from '@/lib/erc8183/get-job';
import { browserRpcUrls } from '@/lib/wallet/browser-rpc';

/**
 * The SDK's `getErc8183Job` for the browser, read through the hire's nodes
 * instead of one.
 *
 * The SDK asks `network.publicRpcUrl` alone: on mainnet that is
 * bsc-rpc.publicnode.com, the endpoint that refused a browser's receipt polls
 * with 403 (`wallet/browser-rpc.ts`) and timed out a server's job read on
 * 1 November (`job-read.ts`). Every job the browser read went there and
 * nowhere else: the job page's poll, the checks before a release, dispute,
 * refund or delivery, and the reads that confirm one landed. A refusal before
 * stops the action before the wallet is asked; one after reports a failure
 * for a transaction that went through.
 *
 * So these reads ask the nodes the hire already uses, in the same order, with
 * the SDK's node kept. Same arguments, same answer, so a call site changes
 * only where it imports from. NodeReal is never asked: its key is server-only.
 */
type JobClient = ReturnType<typeof createPublicClient>;
const clients = new Map<number, JobClient>();

function jobClient(network: NetworkConfig): JobClient {
  const known = clients.get(network.chainId);
  if (known) return known;
  /* One retry on a node before the next, as on the server: a node refusing a browser does not relent on a third ask. */
  const transport = fallback(browserRpcUrls(network.chainId, network.publicRpcUrl).map((url) => http(url, { retryCount: 1 })));
  const client = createPublicClient({ chain: network.chain, transport });
  clients.set(network.chainId, client);
  return client;
}

export async function getErc8183Job(network: NetworkConfig, jobId: bigint): Promise<Erc8183Job> {
  return readErc8183Job(jobClient(network), getAddress(correctedErc8183Addresses(network.chainId).commerce) as Address, jobId);
}
