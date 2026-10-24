import { NextResponse } from 'next/server';
import { isHex } from 'viem';
import { getErc8183Job, verifyErc8183ManifestText } from '@altananetwork/sdk';

import { altanaNetworkFor } from '@/lib/altana/client';
import { deliverableGate } from '@/lib/erc8183/deliverable-gate';
import { deliverableKey, readDeliverable } from '@/lib/erc8183/deliverables';
import { jobChainParam } from '@/lib/jobs/href';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/* Deliverables the chain has confirmed in this process; see below. Bounded by the number of stored deliverables. */
const CONFIRMED = new Set<string>();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const { jobId } = await params;
  const validJobId =
    /^\d+$/.test(jobId) && BigInt(jobId) <= BigInt(Number.MAX_SAFE_INTEGER);
  if (!validJobId) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }
  // `?chain=` names a job on another escrow; testnet URLs never carried it.
  const chainId = jobChainParam(new URL(request.url).searchParams.get('chain')) ?? 97;
  const deliverable = readDeliverable(deliverableKey(chainId, jobId));
  if (!deliverable) {
    return NextResponse.json(
      { error: 'Deliverable not found.' },
      { status: 404 },
    );
  }
  const expected = new URL(request.url).searchParams.get('hash');
  if (expected && (!isHex(expected, { strict: true }) || expected.length !== 66 || !verifyErc8183ManifestText(deliverable.manifestText, expected as `0x${string}`))) {
    return NextResponse.json(
      { error: 'This manifest version does not match the requested hash.' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  /*
   * Published only once it is a delivery. A builder's `prepare` step and
   * Pokter's own sellers write the manifest before the submit transaction,
   * and served then, prepared-but-unsubmitted work was public and cached as
   * immutable. A recorded submit transaction is enough; otherwise the job
   * on chain must commit to exactly these bytes, which also covers a builder
   * who submitted but never confirmed, and copies captured after the fact.
   */
  /*
   * A match is permanent: the chain never un-commits a hash. So a copy the
   * chain has confirmed is served from memory after the first read, and
   * only unconfirmed copies cost a chain read, under a per-address limit
   * and a timeout.
   */
  const key = deliverableKey(chainId, jobId);
  let gate: Awaited<ReturnType<typeof deliverableGate>>;
  if (CONFIRMED.has(key)) {
    gate = { serve: true, readChain: false };
  } else {
    if (!deliverable.submitTxHash) {
      const rate = consumeRateLimit(`deliverable-chain:${requestClientKey(request)}`, { limit: 60, windowMs: 60_000 });
      if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'Cache-Control': 'no-store', 'retry-after': String(rate.retryAfterSeconds) } });
    }
    gate = await deliverableGate(deliverable, () =>
      Promise.race([
        getErc8183Job(altanaNetworkFor(chainId), BigInt(jobId)).then((job) => job.deliverable),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8_000)),
      ]),
    );
    if (gate.serve && gate.readChain) CONFIRMED.add(key);
  }
  if (!gate.serve) {
    return NextResponse.json(
      { error: gate.reason },
      { status: gate.status, headers: { 'Cache-Control': 'no-store', ...(gate.status === 503 ? { 'retry-after': '30' } : {}) } },
    );
  }
  return new NextResponse(deliverable.manifestText, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
