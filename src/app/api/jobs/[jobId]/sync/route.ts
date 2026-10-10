import { NextResponse } from 'next/server';
import { getErc8183DeliverableUrl, getErc8183Job } from '@altananetwork/sdk';
import { createPublicClient, getAddress, http, isHash, pad, toHex, type Hex } from 'viem';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { getJobStore } from '@/lib/erc8183/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const FIELD = { approve: 'settleTxHash', dispute: 'disputeTxHash', reclaim: 'reclaimTxHash' } as const;
type Action = keyof typeof FIELD;

/**
 * Re-read one indexed job from chain, right after its buyer acted on it.
 *
 * The index otherwise waits for the next sweep, so a job settled a minute
 * ago still read as unfinished on the agent's public profile and in Builder
 * Studio. Nothing the caller says is trusted: the status comes from the
 * contract, and a transaction hash is kept only if its receipt succeeded and
 * carries an escrow-contract event for this job. Jobs Pokter never indexed
 * are left alone; adding them is /api/jobs/index's job.
 */
export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }): Promise<NextResponse> {
  const rate = consumeRateLimit(`job-sync:${requestClientKey(request)}`, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many refreshes. Try again shortly.' }, { status: 429 });

  const { jobId } = await context.params;
  if (!/^\d{1,18}$/.test(jobId)) return NextResponse.json({ error: 'A numeric job ID is required.' }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; transactionHash?: unknown };
  const action = typeof body.action === 'string' && body.action in FIELD ? (body.action as Action) : null;
  const hash = typeof body.transactionHash === 'string' && isHash(body.transactionHash) ? (body.transactionHash as Hex) : null;

  const store = getJobStore();
  const existing = store.byId(`${ALTANA_NETWORK.chainId}:${jobId}`);
  if (!existing) return NextResponse.json({ synced: false, reason: 'not-indexed' });

  try {
    const id = BigInt(jobId);
    const onchain = await getErc8183Job(ALTANA_NETWORK, id);
    const deliverableUrl =
      existing.deliverableUrl ??
      (['SUBMITTED', 'COMPLETED'].includes(onchain.statusName)
        ? await Promise.race([
            getErc8183DeliverableUrl(ALTANA_NETWORK, id).catch(() => undefined),
            new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 8_000)),
          ])
        : undefined) ??
      null;

    let verifiedHash: { field: (typeof FIELD)[Action]; hash: Hex } | null = null;
    if (action && hash) {
      const rpc = createPublicClient({ chain: ALTANA_NETWORK.chain, transport: http(ALTANA_NETWORK.publicRpcUrl) });
      const receipt = await rpc.getTransactionReceipt({ hash }).catch(() => null);
      const commerce = getAddress(correctedErc8183Addresses(ALTANA_NETWORK.chainId).commerce);
      const topic = pad(toHex(id), { size: 32 }).toLowerCase();
      const namesJob = receipt?.status === 'success' && receipt.logs.some((log) => getAddress(log.address) === commerce && log.topics[1]?.toLowerCase() === topic);
      if (namesJob) verifiedHash = { field: FIELD[action], hash };
    }

    store.record({
      ...existing,
      status: onchain.statusName,
      statusCheckedAt: new Date().toISOString(),
      deliverableUrl,
      ...(verifiedHash ? { [verifiedHash.field]: verifiedHash.hash } : {}),
    });
    return NextResponse.json({ synced: true, status: onchain.statusName, transactionRecorded: Boolean(verifiedHash) });
  } catch (error) {
    return NextResponse.json({ error: `The job could not be read from chain: ${(error as Error).message}` }, { status: 502 });
  }
}
