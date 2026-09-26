import 'server-only';

import {
  encodeErc8183Manifest,
  getErc8183Job,
  submitErc8183Deliverable,
  type Erc8183DeliverableManifest,
} from '@altananetwork/sdk';
import type { Address } from 'viem';

import { adminSigner, ALTANA_NETWORK, altanaClient } from '@/lib/altana/client';
import { assertTestnetOnly } from '@/lib/erc8183/demo-guard';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import {
  readDeliverable,
  writeDeliverable,
  type StoredDeliverable,
} from '@/lib/erc8183/deliverables';

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

function deliveryUrl(jobId: string): string {
  return new URL(`/api/seller/deliverables/${jobId}`, publicBaseUrl()).href;
}

function resultFromStored(stored: StoredDeliverable): DemoDeliveryResult {
  return {
    status: 'accepted',
    jobId: stored.jobId,
    deliverableUrl: deliveryUrl(stored.jobId),
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
  const content = JSON.stringify({
    title: 'Pokter verified execution receipt',
    task: job.description,
    result: {
      escrow_verified: true,
      job_id: Number(id),
      chain_id: ALTANA_NETWORK.chainId,
      client: job.client,
      provider: job.provider,
      budget_raw: job.budget.toString(),
      status_at_acceptance: job.statusName,
    },
    limits:
      'This demonstration proves the funded seller-notification, delivery and settlement lifecycle. It is not investment advice or a claim of trading performance.',
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
      producer: 'Pokter delivery agent',
      generated_at: new Date().toISOString(),
      proof: 'ERC-8183 funded job re-read before submission',
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
      { jobId: id, manifest, deliverableUrl: deliveryUrl(jobId) },
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
