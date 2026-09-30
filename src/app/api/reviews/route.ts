import { NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';
import { getAddress, isAddress, isHex, verifyMessage, type Hex } from 'viem';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { decodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { reviewMessage, validReviewContent, type VerifiedReview } from '@/lib/reviews/model';
import { getReviewStore } from '@/lib/reviews/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const agentChainId = Number(url.searchParams.get('agentChainId'));
  const agentTokenId = url.searchParams.get('agentTokenId') ?? '';
  if (![56, 97].includes(agentChainId) || !/^\d+$/.test(agentTokenId)) {
    return NextResponse.json({ error: 'Valid agentChainId and agentTokenId are required.' }, { status: 400 });
  }
  return NextResponse.json({ reviews: getReviewStore().byAgent(agentChainId, agentTokenId) });
}

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`review:${requestClientKey(request)}`, { limit: 5, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Review limit reached. Try again shortly.' }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 }); }

  const jobId = String(body.jobId ?? '');
  const buyer = String(body.buyer ?? '');
  const signature = String(body.signature ?? '');
  const agentChainId = Number(body.agentChainId);
  const agentTokenId = String(body.agentTokenId ?? '');
  const content = body.content;
  if (!/^\d+$/.test(jobId) || !isAddress(buyer) || !isHex(signature) ||
      ![56, 97].includes(agentChainId) || !/^\d+$/.test(agentTokenId) ||
      !validReviewContent(content)) {
    return NextResponse.json({ error: 'The review payload is invalid.' }, { status: 400 });
  }

  try {
    const job = await getErc8183Job(ALTANA_NETWORK, BigInt(jobId));
    if (job.statusName !== 'COMPLETED') {
      return NextResponse.json({ error: 'Only completed jobs can be reviewed.' }, { status: 409 });
    }
    if (getAddress(job.client) !== getAddress(buyer)) {
      return NextResponse.json({ error: 'Only the on-chain buyer can review this job.' }, { status: 403 });
    }
    const envelope = decodePokterJobEnvelope(job.description);
    if (!envelope || envelope.identity.chainId !== agentChainId || envelope.identity.tokenId !== agentTokenId) {
      return NextResponse.json({ error: 'The job does not identify this agent.' }, { status: 409 });
    }
    const message = reviewMessage({ chainId: ALTANA_NETWORK.chainId, jobId, agentChainId, agentTokenId, content });
    if (!(await verifyMessage({ address: buyer, message, signature: signature as Hex }))) {
      return NextResponse.json({ error: 'The buyer signature is invalid.' }, { status: 403 });
    }
    const review: VerifiedReview = {
      chainId: ALTANA_NETWORK.chainId, jobId, agentChainId, agentTokenId,
      buyer: getAddress(buyer), ...content, comment: content.comment.trim(),
      signature: signature as Hex, updatedAt: new Date().toISOString(),
    };
    getReviewStore().upsert(review);
    return NextResponse.json({ review });
  } catch (error) {
    return NextResponse.json({ error: `Review verification failed: ${(error as Error).message}` }, { status: 502 });
  }
}
