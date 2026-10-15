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

import { ALTANA_NETWORK, altanaNetworkFor } from '@/lib/altana/client';
import { isEscrowChain } from '@/lib/network/escrow';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { jobIdentity } from '@/lib/erc8183/job-identity';
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

function receiptNamesJob(receipt: Awaited<ReturnType<ReturnType<typeof createPublicClient>['getTransactionReceipt']>>, jobId: bigint, chainId: number): boolean {
  const commerce = getAddress(correctedErc8183Addresses(chainId).commerce);
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
  /*
   * The hash is optional, because the chain already settles this.
   *
   * It was required, and a hire funded through `wallet_sendCalls` does not
   * always come back with one — the wallet reports a calls id and may
   * report no receipt hash at all. The client then skipped indexing
   * entirely and warned to a console nobody reads, so a real funded job
   * was missing from Pokter's own public numbers while sitting on chain.
   * That is how mainnet job 56980 came to exist while /api/v1/activity
   * reported no mainnet jobs.
   *
   * Nothing is taken on trust for it. A job still has to be funded on
   * chain and carry a Pokter envelope whose provider matches the job's,
   * which is the whole of what the hash was used to corroborate; when a
   * hash is supplied it is still checked.
   */
  const hashText = String(body.transactionHash ?? '');
  const transactionHash = isHash(hashText) ? (hashText as Hex) : null;
  if (!/^\d+$/.test(jobIdText) || (hashText && !transactionHash)) {
    return NextResponse.json({ error: 'A numeric jobId is required, and transactionHash must be a hash when given.' }, { status: 400 });
  }
  // The escrow the job was funded on. Omitted by older clients, which only
  // ever funded on the default network.
  const chainId = body.chainId === undefined ? ALTANA_NETWORK.chainId : Number(body.chainId);
  if (!isEscrowChain(chainId)) {
    return NextResponse.json({ error: 'Jobs are indexed only on the escrow chains Pokter funds hires on.' }, { status: 400 });
  }
  const network = altanaNetworkFor(chainId);

  try {
    const jobId = BigInt(jobIdText);
    const rpc = createPublicClient({ chain: network.chain, transport: http(network.publicRpcUrl) });
    const [onchain, receipt] = await Promise.all([
      getErc8183Job(network, jobId),
      transactionHash ? rpc.getTransactionReceipt({ hash: transactionHash }) : Promise.resolve(null),
    ]);
    if (receipt && (receipt.status !== 'success' || !receiptNamesJob(receipt, jobId, chainId))) {
      return NextResponse.json({ error: 'The transaction does not verify creation or funding of this job.' }, { status: 409 });
    }
    if (onchain.statusName === 'OPEN') {
      return NextResponse.json({ error: 'The job exists but is not funded.' }, { status: 409 });
    }

    const identity = await jobIdentity(onchain.description, onchain.provider, chainId);
    if (!identity) {
      return NextResponse.json({ error: 'The funded job is not Pokter’s: it carries no Pokter envelope, and no quote Pokter negotiated for this provider and network.' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const indexed: HiredJob = {
      id: `${chainId}:${jobIdText}`,
      jobId: jobIdText,
      chainId,
      isTestnet: chainId === 97,
      agentChainId: identity.agentChainId,
      agentTokenId: identity.agentTokenId,
      agentName: identity.agentName,
      providerLabel: identity.providerLabel,
      client: onchain.client,
      provider: onchain.provider,
      task: identity.task,
      budgetRaw: onchain.budget.toString(),
      expiredAt: new Date(Number(onchain.expiredAt) * 1000).toISOString(),
      hiredAt: now,
      hireTxHash: transactionHash,
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
