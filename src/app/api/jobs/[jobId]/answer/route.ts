import { NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';
import { keccak256, stringToBytes } from 'viem';

import { altanaNetworkFor } from '@/lib/altana/client';
import { logAndPublic } from '@/lib/api/public-error';
import { readDeliveredAnswer } from '@/lib/delivery/answer';
import { deliverableKey, readDeliverable } from '@/lib/erc8183/deliverables';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { findDeliverableUrl } from '@/lib/erc8183/deliverable-url';
import { fetchDeliverableText } from '@/lib/erc8183/fetch-deliverable';
import { questClient } from '@/lib/quest/indexer';
import { getJobStore } from '@/lib/erc8183/store';
import { jobChainParam } from '@/lib/jobs/href';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { manifestMatch } from '@/lib/erc8183/manifest-match';

export const dynamic = 'force-dynamic';

/**
 * A delivered job's answer, read for the job page.
 *
 * The delivery is already public (its URL is on chain), so this adds no
 * exposure; it reads it so a buyer does not have to open a JSON file. From
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
    let manifestText = readDeliverable(deliverableKey(chainId, jobId))?.manifestText ?? null;
    if (!manifestText) {
      const indexed = getJobStore().all().find((j) => j.chainId === chainId && j.jobId === jobId);
      // The index, else the submit event found near its own block, within a bound: a slow chain read must not hang the page.
      /*
       * Three outcomes, not two. A chain read that errors and one that
       * runs out of time both used to arrive here as "no url" and were
       * reported as the agent having published nothing — Pokter's own
       * failure, stated as a fact about somebody else's agent, on the
       * page their buyer reads.
       */
      type Lookup = { url: string } | { url: null; whose: 'ours' | 'theirs' };
      const lookup: Lookup = indexed?.deliverableUrl
        ? { url: indexed.deliverableUrl }
        : await Promise.race([
            findDeliverableUrl(questClient(chainId === 56 ? 56 : 97), correctedErc8183Addresses(chainId).policy, BigInt(jobId), job.submittedAt)
              .then((found): Lookup => (found ? { url: found } : { url: null, whose: 'theirs' }))
              .catch((): Lookup => ({ url: null, whose: 'ours' })),
            new Promise<Lookup>((resolve) => setTimeout(() => resolve({ url: null, whose: 'ours' }), 12_000)),
          ]);
      const url = lookup.url;
      if (!url) {
        return NextResponse.json({
          delivered: true,
          readable: false,
          reason:
            'whose' in lookup && lookup.whose === 'ours'
              ? 'We could not retrieve the delivery link just now. The agent may well have published one; this check timed out or the chain read failed.'
              : 'The agent published no readable link for its delivery.',
        });
      }
      manifestText = await fetchDeliverableText(url).catch(() => null);
      if (!manifestText) return NextResponse.json({ delivered: true, readable: false, reason: 'The delivery link could not be read just now.' });
    }
    const matchedBy = manifestMatch(manifestText, job.deliverable);
    return NextResponse.json({
      delivered: true,
      readable: true,
      matchesChain: matchedBy !== null,
      matchedBy,
      manifestHash: keccak256(stringToBytes(manifestText)),
      answer: readDeliveredAnswer(manifestText),
    });
  } catch (error) {
    return NextResponse.json({ error: `The answer could not be read: ${logAndPublic('job-answer', error)}` }, { status: 502 });
  }
}
