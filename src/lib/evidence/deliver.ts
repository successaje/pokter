import 'server-only';

import {
  buildSubmitCall,
  encodeErc8183Manifest,
  erc8183ManifestHash,
  getErc8183Job,
  type Erc8183DeliverableManifest,
} from '@altananetwork/sdk';
import {
  createWalletClient,
  createPublicClient,
  getAddress,
  http,
  stringToHex,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc, bscTestnet } from 'viem/chains';

import { altanaNetworkFor } from '@/lib/altana/client';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { readDeliverable, writeDeliverable } from '@/lib/erc8183/deliverables';
import { jobTaskFromDescription } from '@/lib/erc8183/job-envelope';
import { evidenceAgentWallet } from '@/lib/evidence/negotiate';
import { siteOrigin } from '@/lib/evidence/origin';
import { evidenceFor, parseAgentRef } from '@/lib/evidence/report';
import { EVIDENCE_CHAINS } from '@/lib/evidence/refs';
import type { ChainId } from '@/lib/scan/types';
import { builtWithPokter } from '@/lib/brand/built-with';

/**
 * The evidence agent delivering a job it was paid for.
 *
 * It could quote and it could answer, and it could not finish. A buyer
 * funded escrow and the agent had no way to know, no way to submit, and
 * no intention of either — so the job would have sat funded until it
 * expired and the buyer reclaimed. An agent that takes a price and
 * cannot complete a job is the exact shape this marketplace exists to
 * expose in other people's agents, and Pokter shipped one.
 *
 * Pokter tells an agent its job is funded by sending `notify_funded` to
 * the endpoint on its card, and expects the agent to submit the
 * deliverable itself. That is what this does.
 *
 * Nothing here trusts the message. The job is re-read from the escrow
 * and must be funded, must name this agent's own wallet as the provider,
 * and must carry a brief naming an agent: Pokter's envelope, or the signed quote alone.
 * A caller who simply knows a job number cannot make the agent spend gas
 * on somebody else's work.
 */

export type DeliveryOutcome =
  | { status: 'delivered'; jobId: string; transactionHash: Hex | null; deliverableUrl: string }
  | { status: 'already-delivered'; jobId: string; deliverableUrl: string }
  | { status: 'refused'; jobId: string; reason: string };

/** Only an escrow this agent is actually listed on. */
function escrowChain(chainId: number): ChainId | null {
  return (EVIDENCE_CHAINS as number[]).includes(chainId) ? (chainId as ChainId) : null;
}

function deliveryUrl(jobId: string, hash: Hex): string {
  const url = new URL(`/api/seller/deliverables/${jobId}`, siteOrigin());
  url.searchParams.set('hash', hash);
  return url.href;
}

/**
 * The wallet that must sign, which is the one the registry names.
 *
 * The agent's provider address is an EOA — the operator key's own
 * address, which is what quotes recover to and what the registry
 * records — so the submission is an ordinary transaction from it rather
 * than a relayed smart-account intent.
 */
function submitterAccount() {
  const key = process.env.ALTANA_ADMIN_KEY;
  if (!key || !key.startsWith('0x')) {
    throw new Error('ALTANA_ADMIN_KEY is not usable, so the agent cannot sign a submission.');
  }
  return privateKeyToAccount(key as Hex);
}

export async function deliverEvidenceJob(
  escrowChainId: number,
  jobIdText: string,
): Promise<DeliveryOutcome> {
  const chainId = escrowChain(escrowChainId);
  if (!chainId) {
    return { status: 'refused', jobId: jobIdText, reason: `This agent is not listed on chain ${escrowChainId}.` };
  }
  if (!/^\d+$/.test(jobIdText)) {
    return { status: 'refused', jobId: jobIdText, reason: 'A numeric job id is required.' };
  }

  const existing = readDeliverable(jobIdText);
  if (existing?.submitTxHash) {
    return {
      status: 'already-delivered',
      jobId: jobIdText,
      deliverableUrl: deliveryUrl(jobIdText, erc8183ManifestHash(JSON.parse(existing.manifestText))),
    };
  }

  const network = altanaNetworkFor(chainId);
  const job = await getErc8183Job(network, BigInt(jobIdText));

  if (job.statusName !== 'FUNDED') {
    return { status: 'refused', jobId: jobIdText, reason: `The job is ${job.statusName.toLowerCase()}, and only a funded job can be delivered.` };
  }

  /*
   * The agent delivers its own work and nobody else's. Without this a
   * stranger could name any funded job and have the agent spend gas
   * submitting to it.
   */
  const wallet = evidenceAgentWallet();
  if (getAddress(job.provider) !== getAddress(wallet)) {
    return { status: 'refused', jobId: jobIdText, reason: 'This job does not name this agent as its provider.' };
  }

  // Pokter's envelope, or the buyer's signed quote alone: both carry the brief.
  const brief = jobTaskFromDescription(job.description);
  if (brief === null) {
    return { status: 'refused', jobId: jobIdText, reason: 'The job carries no readable brief.' };
  }

  /*
   * The brief is the buyer's own words. An evidence report needs an
   * agent to report on, so a brief naming none is refused rather than
   * answered with a guess — delivering the wrong agent's record would be
   * worse than delivering nothing.
   */
  const ref = parseAgentRef(brief, chainId);
  if (!ref) {
    return {
      status: 'refused',
      jobId: jobIdText,
      reason:
        'The brief does not name an agent to report on. Ask for one as "56/303779" or "eip155:97:2554", and the escrow is reclaimable in the meantime.',
    };
  }

  const report = await evidenceFor(ref.chainId, ref.tokenId, siteOrigin().origin);
  const addresses = correctedErc8183Addresses(chainId);
  const manifest: Erc8183DeliverableManifest = {
    version: 1,
    job_id: Number(jobIdText),
    chain_id: chainId,
    contracts: { commerce: addresses.commerce, router: addresses.router, policy: addresses.policy },
    response: { content: JSON.stringify(report), content_type: 'application/json' },
    metadata: {
      producer: 'Pokter Evidence',
      ...builtWithPokter,
      answered_by: `${ref.chainId}:${ref.tokenId}`,
      generated_at: new Date().toISOString(),
      proof:
        'ERC-8183 funded job re-read from the escrow before submission; every field in the report carries its own provenance.',
    },
  };

  const manifestText = encodeErc8183Manifest(manifest);
  const hash = erc8183ManifestHash(manifest);
  const createdAt = new Date().toISOString();

  /* The bytes must be fetchable before their URL is published on chain. */
  writeDeliverable({ jobId: jobIdText, manifestText, submitTxHash: null, createdAt });

  /*
   * The URL rides in `optParams` as the convention expects: the contract
   * stores the hash, and the bytes live where the params say. Written
   * out rather than handed to the SDK's higher-level helper, because
   * that one submits through a relayed smart account and this agent's
   * provider is a plain EOA.
   */
  const call = buildSubmitCall({
    addresses,
    jobId: BigInt(jobIdText),
    deliverable: hash,
    optParams: stringToHex(JSON.stringify({ deliverable_url: deliveryUrl(jobIdText, hash) })),
  });

  const chain = chainId === 56 ? bsc : bscTestnet;
  const account = submitterAccount();
  const walletClient = createWalletClient({ account, chain, transport: http(network.publicRpcUrl) });
  const read = createPublicClient({ chain, transport: http(network.publicRpcUrl) });

  const transactionHash = await walletClient.sendTransaction({
    to: call.to as Address,
    data: call.data as Hex,
  });
  const receipt = await read.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== 'success') {
    /* Never advertise bytes whose URL was not committed. */
    writeDeliverable({ jobId: jobIdText, manifestText, submitTxHash: null, createdAt });
    return { status: 'refused', jobId: jobIdText, reason: 'The submission transaction reverted; nothing was delivered.' };
  }

  writeDeliverable({ jobId: jobIdText, manifestText, submitTxHash: transactionHash, createdAt });
  return {
    status: 'delivered',
    jobId: jobIdText,
    transactionHash,
    deliverableUrl: deliveryUrl(jobIdText, hash),
  };
}
