import { NextResponse } from 'next/server';

import { jobPaymentTokenOnChain } from '@/lib/erc8183/job-onchain';
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
import { preparedHireMismatch, type JobAttachment } from '@/lib/assistant/prepared-store';
import { isEscrowChain } from '@/lib/network/escrow';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { jobIdentity } from '@/lib/erc8183/job-identity';
import { attributeJob } from '@/lib/erc8183/attribute-owners';
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
    const [onchain, receipt, paymentToken] = await Promise.all([
      getErc8183Job(network, jobId),
      transactionHash ? rpc.getTransactionReceipt({ hash: transactionHash }) : Promise.resolve(null),
      /* The job's own token; a failed read leaves it unknown for the sweep to fill. */
      jobPaymentTokenOnChain(chainId, jobIdText),
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
      paymentToken,
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
    // Who owns the agent now is who took the job on, read while that is still true; the sweep retries a miss.
    void attributeJob(indexed).catch(() => false);

    /*
     * And, where the hire came from a prepared request, which request it
     * was. This is the step that closes the loop an assistant cannot
     * otherwise close: it hands the owner an unsigned request, the owner
     * funds it in their own wallet, and nothing told Pokter which request
     * that payment answered — so `prepare_hire` could offer the same
     * purchase again. The key rides in the approval link and comes back
     * here, at the one moment that already proves a job is funded and
     * Pokter's.
     *
     * It is a claim from a browser, so it is checked against this job
     * before it is kept (`preparedHireMismatch`), and the unique index
     * means one job can answer one request. Never fatal: the job is
     * indexed either way, because the record of a funded job is worth more
     * than the bookkeeping that points at it.
     */
    let request: { key: string; attached: JobAttachment | 'not-this-request'; reason?: string } | null = null;
    const requestKey = typeof body.requestKey === 'string' && /^phr_[0-9a-f]{32}$/.test(body.requestKey) ? body.requestKey : null;
    if (requestKey) {
      const prepared = getJobStore().preparedHire(requestKey);
      if (!prepared) {
        request = { key: requestKey, attached: 'no-such-request' };
      } else {
        const mismatch = preparedHireMismatch(prepared, {
          chainId,
          agentChainId: identity.agentChainId,
          agentTokenId: identity.agentTokenId,
          provider: onchain.provider,
          task: identity.task,
          client: onchain.client,
        });
        request = mismatch
          ? { key: requestKey, attached: 'not-this-request', reason: mismatch }
          : { key: requestKey, attached: getJobStore().attachPreparedHireJob(requestKey, jobIdText) };
      }
    }

    return NextResponse.json({ indexed: true, jobId: jobIdText, status: onchain.statusName, ...(request ? { request } : {}) });
  } catch (error) {
    return NextResponse.json({ error: `Job indexing failed: ${(error as Error).message}` }, { status: 502 });
  }
}
