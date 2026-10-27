import { NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';
import { getAddress, isAddress, isHex, type Hex } from 'viem';

import { altanaNetworkFor } from '@/lib/altana/client';
import { logAndPublic } from '@/lib/api/public-error';
import { getJobStore } from '@/lib/erc8183/store';
import { decisionIsFresh, publicationMessage } from '@/lib/jobs/answer-publication';
import { indexedJob } from '@/lib/jobs/evidence';
import { jobChainParam } from '@/lib/jobs/href';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { signedByWallet, walletCanBeChecked } from '@/lib/wallet/signed-by';

export const dynamic = 'force-dynamic';

/**
 * The funding wallet's choice to publish, or stop publishing, a job's
 * delivered answer on Pokter's public pages (see answer-publication.ts).
 *
 * Only the wallet the escrow names as the job's client can make it, read
 * from the chain rather than from Pokter's index, and only with a
 * signature over `publicationMessage` dated within the last few minutes.
 * The newest decision wins; an older one, replayed, changes nothing.
 */
export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }): Promise<NextResponse> {
  const rate = consumeRateLimit(`job-publication:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  const { jobId } = await context.params;
  const chainId = jobChainParam(new URL(request.url).searchParams.get('chain') ?? undefined);
  if (!/^\d{1,18}$/.test(jobId) || chainId === null) {
    return NextResponse.json({ error: 'A numeric job id and its chain are required.' }, { status: 400 });
  }

  let body: { publish?: unknown; decidedAt?: unknown; signature?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected JSON with publish, decidedAt and signature.' }, { status: 400 });
  }
  if (typeof body.publish !== 'boolean' || typeof body.decidedAt !== 'string' || typeof body.signature !== 'string' || !isHex(body.signature)) {
    return NextResponse.json({ error: 'Expected JSON with publish, decidedAt and signature.' }, { status: 400 });
  }
  if (!decisionIsFresh(body.decidedAt)) {
    return NextResponse.json({ error: 'That signature is too old, or dated in the future. Sign again.' }, { status: 400 });
  }
  /* Only jobs Pokter publishes a page for have anything to decide. */
  if (!indexedJob(chainId, jobId)) return NextResponse.json({ error: 'Pokter has no public page for this job.' }, { status: 404 });

  try {
    const job = await getErc8183Job(altanaNetworkFor(chainId), BigInt(jobId));
    if (!job.client || !isAddress(job.client) || /^0x0{40}$/i.test(job.client)) {
      return NextResponse.json({ error: 'The escrow did not name this job’s buyer.' }, { status: 409 });
    }
    const client = getAddress(job.client);
    const signature = body.signature as Hex;
    const message = publicationMessage({ chainId, jobId, publish: body.publish, decidedAt: body.decidedAt });
    if (!(await walletCanBeChecked(chainId, client, signature))) {
      return NextResponse.json({ error: 'This wallet has not acted on chain yet, so its signature cannot be checked.' }, { status: 409 });
    }
    if (!(await signedByWallet(chainId, client, message, signature))) {
      return NextResponse.json({ error: 'Only the wallet that funded this job can decide this.' }, { status: 403 });
    }
    const outcome = getJobStore().recordAnswerPublication({ chainId, jobId, client, published: body.publish, decidedAt: body.decidedAt, signature });
    const current = getJobStore().answerPublication(chainId, jobId);
    return NextResponse.json({ outcome, published: current?.published ?? false, decidedAt: current?.decidedAt ?? null });
  } catch (error) {
    return NextResponse.json({ error: `The choice could not be recorded: ${logAndPublic('job-publication', error)}` }, { status: 502 });
  }
}
