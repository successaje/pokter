import 'server-only';

import { buildSubmitCall, encodeErc8183Manifest, erc8183ManifestHash, getErc8183Job, type Erc8183DeliverableManifest } from '@altananetwork/sdk';
import { createPublicClient, createWalletClient, getAddress, stringToHex, type Address, type Hex } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { altanaNetworkFor } from '@/lib/altana/client';
import { builtWithPokter } from '@/lib/brand/built-with';
import { sendingTransport } from '@/lib/chain/transport';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { deliverableKey, readDeliverable, writeDeliverable } from '@/lib/erc8183/deliverables';
import { disputeWindowSeconds } from '@/lib/erc8183/dispute-window';
import { jobTaskFromDescription } from '@/lib/erc8183/job-envelope';
import { siteOrigin } from '@/lib/evidence/origin';

import { houseAccount } from './keys';
import { submitWindowProblem } from './window';
import type { HouseAgentDefinition, HouseChainId } from './types';

export type HouseDeliveryOutcome =
  | { status: 'delivered'; jobId: string; transactionHash: Hex; deliverableUrl: string }
  | { status: 'already-delivered'; jobId: string; deliverableUrl: string }
  | { status: 'refused'; jobId: string; reason: string };

/** Where the stored manifest is served; `?chain=` for anything but testnet, as the route reads it. */
function deliveryUrl(chainId: HouseChainId, jobId: string, hash: Hex): string {
  const url = new URL(`/api/seller/deliverables/${jobId}`, siteOrigin());
  if (chainId !== 97) url.searchParams.set('chain', String(chainId));
  url.searchParams.set('hash', hash);
  return url.href;
}

/**
 * Deliver a funded job: re-read it, check it can still be submitted, do the
 * work, store the manifest where its URL points, then submit from the
 * agent's own wallet.
 *
 * Nothing is submitted unless the work produced an answer. An error dressed
 * as a delivery is what Pokter's first mainnet job received; a refusal
 * with the reason reaches the buyer as one (see seller-notice), and the
 * escrow stays theirs to reclaim.
 */
export async function deliverHouseJob(definition: HouseAgentDefinition, chainId: HouseChainId, jobId: string): Promise<HouseDeliveryOutcome> {
  if (!/^\d+$/.test(jobId)) return { status: 'refused', jobId, reason: 'A numeric job id is required.' };
  const key = deliverableKey(chainId, jobId);
  const existing = readDeliverable(key);
  if (existing?.submitTxHash) {
    return { status: 'already-delivered', jobId, deliverableUrl: deliveryUrl(chainId, jobId, erc8183ManifestHash(JSON.parse(existing.manifestText))) };
  }

  const account = houseAccount(definition);
  const network = altanaNetworkFor(chainId);
  const job = await getErc8183Job(network, BigInt(jobId));
  if (job.statusName !== 'FUNDED') {
    return { status: 'refused', jobId, reason: `The job is ${job.statusName.toLowerCase()}; only a funded job can be delivered.` };
  }
  if (getAddress(job.provider) !== account.address) {
    return { status: 'refused', jobId, reason: `This job does not name ${definition.name} as its provider.` };
  }
  const windowProblem = submitWindowProblem({
    expiredAt: Number(job.expiredAt),
    now: Math.floor(Date.now() / 1000),
    disputeWindowSeconds: await disputeWindowSeconds(chainId),
  });
  if (windowProblem) return { status: 'refused', jobId, reason: windowProblem };

  const brief = jobTaskFromDescription(job.description);
  if (brief === null) return { status: 'refused', jobId, reason: 'The job carries no readable brief.' };
  const problem = definition.check(brief);
  if (problem) return { status: 'refused', jobId, reason: `${problem.error}. ${problem.need}` };

  const result = await definition.run(brief, { chainId, now: new Date() });
  if (!result.ok) {
    return { status: 'refused', jobId, reason: `${result.error}${result.need ? `. ${result.need}` : ''}. Nothing was submitted; the escrow stays reclaimable.` };
  }

  const addresses = correctedErc8183Addresses(chainId);
  const manifest: Erc8183DeliverableManifest = {
    version: 1,
    job_id: Number(jobId),
    chain_id: chainId,
    contracts: { commerce: addresses.commerce, router: addresses.router, policy: addresses.policy },
    response: { content: JSON.stringify(result.content), content_type: 'application/json' },
    metadata: {
      producer: definition.name,
      ...builtWithPokter,
      operated_by: 'Pokter',
      version: definition.version,
      generated_at: new Date().toISOString(),
    },
  };
  const manifestText = encodeErc8183Manifest(manifest);
  const hash = erc8183ManifestHash(manifest);
  const createdAt = new Date().toISOString();
  // Retrievable before the URL is published on chain.
  writeDeliverable({ jobId: key, manifestText, submitTxHash: null, createdAt });

  const call = buildSubmitCall({
    addresses,
    jobId: BigInt(jobId),
    deliverable: hash,
    optParams: stringToHex(JSON.stringify({ deliverable_url: deliveryUrl(chainId, jobId, hash) })),
  });
  const chain = chainId === 56 ? bsc : bscTestnet;
  const wallet = createWalletClient({ account, chain, transport: sendingTransport(chainId) });
  const read = createPublicClient({ chain, transport: sendingTransport(chainId) });
  const transactionHash = await wallet.sendTransaction({ to: call.to as Address, data: call.data as Hex });
  const receipt = await read.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== 'success') {
    return { status: 'refused', jobId, reason: 'The submission transaction reverted; nothing was delivered.' };
  }
  writeDeliverable({ jobId: key, manifestText, submitTxHash: transactionHash, createdAt });
  return { status: 'delivered', jobId, transactionHash, deliverableUrl: deliveryUrl(chainId, jobId, hash) };
}
