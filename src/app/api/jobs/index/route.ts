import { NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';
import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  isHash,
  type Hex,
} from 'viem';

import { ALTANA_NETWORK, IS_TESTNET } from '@/lib/altana/client';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { decodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { getJobStore } from '@/lib/erc8183/store';
import type { HiredJob } from '@/lib/erc8183/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

const LIFECYCLE_EVENTS = [
  {
    type: 'event', name: 'JobCreated', inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'provider', type: 'address', indexed: true },
      { name: 'evaluator', type: 'address', indexed: false },
      { name: 'expiredAt', type: 'uint256', indexed: false },
      { name: 'hook', type: 'address', indexed: false },
    ],
  },
  {
    type: 'event', name: 'JobFunded', inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'provider', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;

function receiptNamesJob(receipt: Awaited<ReturnType<ReturnType<typeof createPublicClient>['getTransactionReceipt']>>, jobId: bigint): boolean {
  const commerce = getAddress(correctedErc8183Addresses(ALTANA_NETWORK.chainId).commerce);
  return receipt.logs.some((log) => {
    if (getAddress(log.address) !== commerce) return false;
    try {
      const decoded = decodeEventLog({ abi: LIFECYCLE_EVENTS, data: log.data, topics: log.topics });
      return decoded.args.jobId === jobId;
    } catch {
      return false;
    }
  });
}

/** Add a buyer-signed job to Pokter's public index only after chain verification. */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`job-index:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Indexing limit reached. Try again shortly.' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const jobIdText = String(body.jobId ?? '');
  const transactionHash = String(body.transactionHash ?? '');
  if (!/^\d+$/.test(jobIdText) || !isHash(transactionHash)) {
    return NextResponse.json({ error: 'A numeric jobId and transactionHash are required.' }, { status: 400 });
  }

  try {
    const jobId = BigInt(jobIdText);
    const rpc = createPublicClient({ chain: ALTANA_NETWORK.chain, transport: http(ALTANA_NETWORK.publicRpcUrl) });
    const [onchain, receipt] = await Promise.all([
      getErc8183Job(ALTANA_NETWORK, jobId),
      rpc.getTransactionReceipt({ hash: transactionHash as Hex }),
    ]);
    if (receipt.status !== 'success' || !receiptNamesJob(receipt, jobId)) {
      return NextResponse.json({ error: 'The transaction does not verify creation or funding of this job.' }, { status: 409 });
    }
    if (onchain.statusName === 'OPEN') {
      return NextResponse.json({ error: 'The job exists but is not funded.' }, { status: 409 });
    }

    const envelope = decodePokterJobEnvelope(onchain.description);
    if (!envelope || getAddress(envelope.provider) !== getAddress(onchain.provider)) {
      return NextResponse.json({ error: 'The funded job has no valid Pokter identity envelope.' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const indexed: HiredJob = {
      id: `${ALTANA_NETWORK.chainId}:${jobIdText}`,
      jobId: jobIdText,
      chainId: ALTANA_NETWORK.chainId,
      isTestnet: IS_TESTNET,
      agentChainId: envelope.identity.chainId,
      agentTokenId: envelope.identity.tokenId,
      agentName: envelope.identity.name ?? `Agent #${envelope.identity.tokenId}`,
      providerLabel: envelope.providerLabel,
      provider: onchain.provider,
      task: envelope.task,
      budgetRaw: onchain.budget.toString(),
      expiredAt: new Date(Number(onchain.expiredAt) * 1000).toISOString(),
      hiredAt: now,
      hireTxHash: transactionHash as Hex,
      status: onchain.statusName,
      statusCheckedAt: now,
      deliverableUrl: null,
      settleTxHash: null,
      disputeTxHash: null,
    };
    getJobStore().record(indexed);
    return NextResponse.json({ indexed: true, jobId: jobIdText, status: onchain.statusName });
  } catch (error) {
    return NextResponse.json({ error: `Job indexing failed: ${(error as Error).message}` }, { status: 502 });
  }
}
