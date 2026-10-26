import 'server-only';

import {
  encodeErc8183Manifest,
  erc8183ManifestHash,
  getErc8183Job,
  submitErc8183Deliverable,
  type Erc8183DeliverableManifest,
} from '@altananetwork/sdk';
import { createPublicClient, http, keccak256, stringToHex, type Address, type Hex } from 'viem';

import { adminSigner, ALTANA_NETWORK, altanaClient } from '@/lib/altana/client';
import { decodePokterJobEnvelope } from './job-envelope';
import { askAgentByIdentity } from './courier';
import { verifyReferenceDelivery } from './reference-delivery';
import { jobPaymentTokenOnChain } from './job-onchain';
import { getJobStore } from '@/lib/erc8183/store';
import { getAgent } from '@/lib/scan/client';
import { classify } from '@/lib/agents/categories';
import type { ChainId } from '@/lib/scan/types';
import { assertTestnetOnly } from '@/lib/erc8183/demo-guard';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import {
  readDeliverable,
  writeDeliverable,
  type StoredDeliverable,
} from '@/lib/erc8183/deliverables';
import { builtWithPokter } from '@/lib/brand/built-with';

const inFlight = new Map<string, Promise<DemoDeliveryResult>>();
let sellerAddressPromise: Promise<Address> | undefined;

export interface DemoDeliveryResult {
  status: 'accepted';
  jobId: string;
  deliverableUrl: string;
  submitTxHash: `0x${string}` | null;
}

export async function demoSellerAddress(): Promise<Address> {
  assertTestnetOnly();
  sellerAddressPromise ??= altanaClient()
    .createWallet({ signer: adminSigner('demo-seller') })
    .then((wallet) => wallet.address)
    .catch((error) => {
      sellerAddressPromise = undefined;
      throw error;
    });
  return sellerAddressPromise;
}

export async function isDemoSeller(address: string): Promise<boolean> {
  assertTestnetOnly();
  return (await demoSellerAddress()).toLowerCase() === address.toLowerCase();
}

function publicBaseUrl(): URL {
  return new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4311');
}

/**
 * Refuse to commit a deliverable URL nobody else can fetch.
 *
 * POK-036. The submitted URL is written on chain and cannot be edited. Running
 * a delivery locally, where `NEXT_PUBLIC_APP_URL` falls back to localhost,
 * permanently records a receipt that no buyer and no verifier can ever
 * resolve — job #1352 on testnet carries exactly that, and it will say
 * `http://localhost:4311/...` forever.
 *
 * Failing here costs a developer one environment variable. Not failing costs
 * a buyer their only route to check what they paid for.
 */
function assertPubliclyFetchable(url: URL): void {
  const host = url.hostname.replace(/^\[(.+)\]$/, '$1');
  const local =
    url.protocol !== 'https:' ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  if (local) {
    throw new Error(
      `Refusing to submit a deliverable at ${url.href}: the URL is written on ` +
        'chain permanently and this one is not publicly fetchable. Set ' +
        'NEXT_PUBLIC_APP_URL to the deployed origin before delivering.',
    );
  }
}

function deliveryUrl(jobId: string, deliverable: Hex): string {
  const url = new URL(`/api/seller/deliverables/${jobId}`, publicBaseUrl());
  url.searchParams.set('hash', deliverable);
  assertPubliclyFetchable(url);
  return url.href;
}

function resultFromStored(stored: StoredDeliverable): DemoDeliveryResult {
  return {
    status: 'accepted',
    jobId: stored.jobId,
    deliverableUrl: deliveryUrl(stored.jobId, keccak256(stringToHex(stored.manifestText))),
    submitTxHash: stored.submitTxHash,
  };
}

async function performDelivery(jobId: string): Promise<DemoDeliveryResult> {
  const existing = readDeliverable(jobId);
  if (existing?.submitTxHash) return resultFromStored(existing);

  const id = BigInt(jobId);
  if (id > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Job id exceeds the supported manifest range.');
  }
  const signer = adminSigner('demo-seller');
  const wallet = await altanaClient().createWallet({ signer });
  const job = await getErc8183Job(ALTANA_NETWORK, id);
  if (job.provider.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error('The funded job names a different seller wallet.');
  }
  if (job.statusName !== 'FUNDED') {
    if (job.statusName === 'SUBMITTED' && existing)
      return resultFromStored(existing);
    throw new Error(`Job is ${job.statusName}, not FUNDED.`);
  }

  const addresses = correctedErc8183Addresses(ALTANA_NETWORK.chainId);

  /*
   * The answer is the agent's, carried by the seller. The job description is
   * Pokter's envelope naming the agent the buyer chose; the brief inside it
   * goes to that agent's endpoint and what it returns is what is delivered.
   * No envelope, no endpoint or no answer means nothing is delivered: the
   * seller used to submit a receipt with no assessment in it, and a buyer
   * cannot review what was never produced.
   */
  /*
   * Two description formats, both of Pokter's own making.
   *
   * The envelope names its agent and is unchanged below. The reference
   * format — the seller's signed quote alone — names none, and
   * `job-envelope` has always said so: "The second names no agent; that
   * comes from Pokter's index." This path read only the first, so every
   * reference-format job failed here, 44 runs in a row, and three testnet
   * jobs expired FUNDED with nothing ever submitted.
   *
   * The second format is verified harder, not more loosely, because an
   * envelope asserts its agent while a quote has to have one established:
   * the hash must cover this task and these terms, the signature must be the
   * live provider's, the quote must bind to this escrow, token and amount,
   * it must have been live at the funding block, and the index's attribution
   * must agree with the registry. Any gap refuses.
   */
  const envelope = decodePokterJobEnvelope(job.description);
  const brief = envelope
    ? { chainId: envelope.identity.chainId, tokenId: envelope.identity.tokenId, category: envelope.category, task: envelope.task }
    : await referenceBrief(jobId, job);
  const carried = await askAgentByIdentity(brief, jobId);
  const content = JSON.stringify({
    title: `${carried.answeredBy.name ?? `Agent #${brief.tokenId}`}: answer to your brief`,
    task: job.description,
    answer: carried.answer.text && carried.answer.data ? { text: carried.answer.text, ...carried.answer.data } : (carried.answer.data ?? carried.answer.text),
    answered_by: {
      chain_id: carried.answeredBy.chainId,
      token_id: carried.answeredBy.tokenId,
      endpoint: carried.answeredBy.endpoint,
      skill: carried.answeredBy.skill,
      asked_at: carried.askedAt,
      latency_ms: carried.latencyMs,
    },
    escrow: {
      job_id: Number(id),
      chain_id: ALTANA_NETWORK.chainId,
      client: job.client,
      provider: job.provider,
      budget_raw: job.budget.toString(),
      status_at_acceptance: job.statusName,
    },
    limits:
      "Read-only. The answer above is the agent's own, relayed unchanged by Pokter's seller, which cannot see or move any position. It is not investment advice.",
  });
  const manifest: Erc8183DeliverableManifest = {
    version: 1,
    job_id: Number(id),
    chain_id: ALTANA_NETWORK.chainId,
    contracts: {
      commerce: addresses.commerce,
      router: addresses.router,
      policy: addresses.policy,
    },
    response: { content, content_type: 'application/json' },
    metadata: {
      producer: 'Pokter delivery agent (courier)',
      ...builtWithPokter,
      answered_by: `${brief.chainId}:${brief.tokenId}`,
      generated_at: new Date().toISOString(),
      proof: 'ERC-8183 funded job re-read before submission; brief carried to the named agent over A2A',
    },
  };
  const manifestText = encodeErc8183Manifest(manifest);
  const createdAt = new Date().toISOString();

  // The bytes must already be retrievable when the on-chain URL is published.
  writeDeliverable({ jobId, manifestText, submitTxHash: null, createdAt });
  try {
    const result = await submitErc8183Deliverable(
      wallet,
      signer,
      { jobId: id, manifest, deliverableUrl: deliveryUrl(jobId, erc8183ManifestHash(manifest)) },
      { network: ALTANA_NETWORK },
    );
    const stored: StoredDeliverable = {
      jobId,
      manifestText,
      submitTxHash: result.transactionHash ?? null,
      createdAt,
    };
    writeDeliverable(stored);
    return resultFromStored(stored);
  } catch (error) {
    // Do not advertise bytes that were never committed on-chain.
    writeDeliverable({ jobId, manifestText, submitTxHash: null, createdAt });
    throw error;
  }
}

export function submitDemoDeliverable(
  jobId: string,
): Promise<DemoDeliveryResult> {
  assertTestnetOnly();
  const running = inFlight.get(jobId);
  if (running) return running;
  const operation = performDelivery(jobId).finally(() =>
    inFlight.delete(jobId),
  );
  inFlight.set(jobId, operation);
  return operation;
}

/**
 * The brief for a reference-format job, or a throw naming what was missing.
 *
 * Everything it needs is read rather than assumed: the job from the kernel,
 * the attribution from Pokter's index, the wallet and category from the
 * registry, and the funding time from the funding transaction's block —
 * which is the only authoritative record of when the buyer funded. An
 * indexed `hiredAt` is Pokter's own clock and is not used for that.
 */
async function referenceBrief(
  jobId: string,
  job: { provider: Address; budget: bigint; expiredAt: bigint; statusName: string; description: string },
): Promise<{ chainId: number; tokenId: string; category: string; task: string }> {
  const chainId = ALTANA_NETWORK.chainId;
  const indexed = getJobStore().byId(`${chainId}:${jobId}`);
  const addresses = correctedErc8183Addresses(chainId);

  const registryAgent = indexed?.agentChainId && indexed.agentTokenId
    ? await getAgent(indexed.agentChainId as ChainId, indexed.agentTokenId)
        /* `classify` returns the category or 'unclassified'. The latter is
           not a category: it means Pokter could not tell from the registry
           record which of the five this agent is, and picking a skill on
           that basis is guessing. Passed on as empty so the verifier
           refuses rather than addressing the wrong skill. */
        .then((agent) => {
          const classified = classify(agent);
          return { wallet: agent.agent_wallet, category: classified === 'unclassified' ? '' : classified };
        })
        .catch(() => null)
    : null;

  const verdict = await verifyReferenceDelivery({
    description: job.description,
    job: { provider: job.provider, budget: job.budget, expiredAt: job.expiredAt, statusName: job.statusName },
    /* The job's own token from the escrow; a USDT job is not in the deployment default. */
    escrow: { chainId, commerce: addresses.commerce, paymentToken: await jobPaymentTokenOnChain(chainId, jobId) },
    fundedAtMs: await fundingBlockTimestampMs(indexed?.hireTxHash ?? null),
    indexed: indexed
      ? { agentChainId: indexed.agentChainId ?? null, agentTokenId: indexed.agentTokenId ?? null, agentName: indexed.agentName }
      : null,
    registryAgent,
    nowMs: Date.now(),
  });

  if (!verdict.ok) {
    throw new Error(`This job cannot be delivered (${verdict.code}): ${verdict.reason}`);
  }
  return { chainId: verdict.identity.chainId, tokenId: verdict.identity.tokenId, category: verdict.category, task: verdict.task };
}

/** When the funding transaction was mined, from its block. Null when unreadable. */
async function fundingBlockTimestampMs(hash: string | null): Promise<number | null> {
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  try {
    const client = createPublicClient({ chain: ALTANA_NETWORK.chain, transport: http(ALTANA_NETWORK.publicRpcUrl) });
    const receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` });
    if (receipt.status !== 'success') return null;
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    return Number(block.timestamp) * 1000;
  } catch {
    return null;
  }
}
