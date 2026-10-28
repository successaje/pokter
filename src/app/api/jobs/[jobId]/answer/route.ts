import { NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';
import { keccak256, stringToBytes } from 'viem';

import { altanaNetworkFor } from '@/lib/altana/client';
import { logAndPublic } from '@/lib/api/public-error';
import { readDeliveredAnswer } from '@/lib/delivery/answer';
import { readDeliveryText } from '@/lib/delivery/read-delivery';
import { jobChainParam } from '@/lib/jobs/href';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { manifestMatch } from '@/lib/erc8183/manifest-match';
import { getJobStore } from '@/lib/erc8183/store';
import { answerIsPublic } from '@/lib/jobs/answer-publication';
import { jobFunder } from '@/lib/jobs/evidence-view';
import { teamWalletSet } from '@/lib/team/server';

export const dynamic = 'force-dynamic';

/**
 * A delivered job's answer, read for the job page.
 *
 * The delivery's link is on chain, so anyone can read it; this reads it
 * so a buyer does not have to open a JSON file. Not a publication: the job
 * page renders the answer to anyone but the funding wallet only when it is
 * public (`answerIsPublic`), and /api/ is outside the crawl. From
 * Pokter's own copy when it has one, else fetched from the committed URL,
 * and in both cases reported against the hash on chain. Parsed as data and
 * returned as data: the page renders it as text.
 */
export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }): Promise<NextResponse> {
  const rate = consumeRateLimit(`job-answer:${requestClientKey(request)}`, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  const { jobId } = await context.params;
  const chainId = jobChainParam(new URL(request.url).searchParams.get('chain') ?? undefined);
  if (!/^\d{1,18}$/.test(jobId) || chainId === null) {
    return NextResponse.json({ error: 'A numeric job id and its chain are required.' }, { status: 400 });
  }

  try {
    const network = altanaNetworkFor(chainId);
    const job = await getErc8183Job(network, BigInt(jobId));
    if (!['SUBMITTED', 'COMPLETED', 'REJECTED'].includes(job.statusName)) {
      return NextResponse.json({ delivered: false });
    }
    /* Read as the public evidence page reads it (`readDeliveryText`), failures and all. */
    const read = await readDeliveryText(chainId, jobId, job);
    if (!read.ok) return NextResponse.json({ delivered: true, readable: false, reason: read.reason });
    const manifestText = read.text;
    const matchedBy = manifestMatch(manifestText, job.deliverable);
    /*
     * Whether the answer is public (`answerIsPublic`), so the job page
     * shows it to anyone but the funding wallet only when it is, and
     * offers that wallet the choice when it is theirs to make.
     */
    const funder = jobFunder({ client: job.client, provider: job.provider }, teamWalletSet());
    const decision = getJobStore().answerPublication(chainId, jobId);
    return NextResponse.json({
      delivered: true,
      readable: true,
      matchesChain: matchedBy !== null,
      matchedBy,
      manifestHash: keccak256(stringToBytes(manifestText)),
      answer: readDeliveredAnswer(manifestText),
      funder,
      published: answerIsPublic(funder, decision),
      decidedAt: decision?.decidedAt ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: `The answer could not be read: ${logAndPublic('job-answer', error)}` }, { status: 502 });
  }
}
