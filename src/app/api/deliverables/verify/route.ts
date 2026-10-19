import { NextResponse } from 'next/server';
import {
  getErc8183DeliverableUrl,
  getErc8183Job,
} from '@altananetwork/sdk';

import { ALTANA_NETWORK, altanaNetworkFor } from '@/lib/altana/client';
import { jobChainParam } from '@/lib/jobs/href';
import { getJobStore } from '@/lib/erc8183/store';
import { deliverableKey, readDeliverable } from '@/lib/erc8183/deliverables';
import { erc8183ManifestHash } from '@altananetwork/sdk';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { siteUrl } from '@/lib/site';
import { logAndPublic } from '@/lib/api/public-error';
import { fetchDeliverableText } from '@/lib/erc8183/fetch-deliverable';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { findDeliverableUrl } from '@/lib/erc8183/deliverable-url';
import { questClient } from '@/lib/quest/indexer';
import { manifestMatch } from '@/lib/erc8183/manifest-match';

export const dynamic = 'force-dynamic';
/*
 * The fallback scan below walks back through block windows, so this can take
 * meaningfully longer than a cached read when the index has no answer.
 */
export const maxDuration = 60;


export async function GET(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(
    `verify-deliverable:${requestClientKey(request)}`,
    {
      limit: 12,
      windowMs: 60_000,
    },
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Verification limit reached. Try again shortly.' },
      {
        status: 429,
        headers: { 'retry-after': String(rate.retryAfterSeconds) },
      },
    );
  }

  const requestUrl = new URL(request.url);
  const jobId = requestUrl.searchParams.get('jobId') ?? '';
  if (!/^\d+$/.test(jobId) || BigInt(jobId) > BigInt(Number.MAX_SAFE_INTEGER)) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }

  /*
   * The escrow the job is on (`?chain=`). This read testnet only, so a
   * mainnet job was looked up on the testnet escrow, where that number is
   * empty, and every mainnet buyer was told "Job is OPEN; no submitted
   * receipt exists" about a delivered job.
   */
  const chainId = jobChainParam(requestUrl.searchParams.get('chain')) ?? ALTANA_NETWORK.chainId;
  const network = altanaNetworkFor(chainId);

  try {
    const id = BigInt(jobId);
    const job = await getErc8183Job(network, id);
    if (job.statusName !== 'SUBMITTED' && job.statusName !== 'COMPLETED') {
      return NextResponse.json(
        { error: `Job is ${job.statusName}; no submitted receipt exists.` },
        { status: 409 },
      );
    }

    /*
     * The index first, the chain second.
     *
     * `getErc8183DeliverableUrl` scans backwards from the current head in
     * 1,000-block windows, 200 of them — about 200,000 blocks, which on this
     * chain is roughly a week. Past that the submission is simply out of
     * range and the scan returns nothing, so a receipt that verified fine on
     * Monday 404s on the following Tuesday. Job #1368 crossed that line and
     * took the one completed lifecycle in the product with it.
     *
     * Every sweep already reconciles each job against ERC-8183 and keeps the
     * deliverable URL it finds, so the index holds the answer from while the
     * submission was still in range. That value came from this same chain
     * read, and the manifest it points at is still checked against the
     * on-chain hash below (exactly, or as sorted-key JSON; see
     * `manifestMatch`) — nothing here is taken on trust, only remembered.
     */
    const indexed = getJobStore()
      .all()
      .find(
        (job) =>
          job.chainId === chainId && job.jobId === jobId,
      )?.deliverableUrl;

    /*
     * For a deliverable Pokter's own seller submitted, the URL is derivable
     * and needs no chain scan at all: it is `/api/seller/deliverables/<id>`
     * with the manifest hash as a query parameter, and the manifest bytes are
     * already stored here from before the submission was sent. Rebuilding it
     * is exact rather than approximate — the hash is recomputed from the same
     * bytes the chain committed to, and the check below still proves that.
     */
    const stored = readDeliverable(deliverableKey(chainId, jobId));
    const derived = stored
      ? (() => {
          try {
            const url = new URL(
              `/api/seller/deliverables/${jobId}`,
              siteUrl(),
            );
            if (chainId !== 97) url.searchParams.set('chain', String(chainId));
            url.searchParams.set(
              'hash',
              erc8183ManifestHash(JSON.parse(stored.manifestText)),
            );
            return url.href;
          } catch {
            return undefined;
          }
        })()
      : undefined;

    const value =
      indexed ??
      derived ??
      /*
       * Wider windows than the SDK's default for the same total reach: the
       * scan stops as soon as it passes the submission, so a recent job
       * costs a couple of calls while an older one stays reachable instead
       * of falling off a one-week cliff.
       *
       * 2,500 rather than the 5,000 this used to send. The cap was assumed
       * rather than measured, and it was wrong: BNB Chain's own dataseed
       * endpoints refuse eth_getLogs at any width, and publicnode serves
       * 3,000 blocks and refuses 4,000 with "Archive requests require a
       * personal token" — a message about range dressed as one about
       * archives. Every verification of a mainnet receipt failed on it.
       * maxWindows doubles so the reach is unchanged.
       */
      // Near the submit block first: a few dozen reads, and it does not age out.
      (await findDeliverableUrl(questClient(chainId === 56 ? 56 : 97), correctedErc8183Addresses(chainId).policy, id, job.submittedAt).catch(() => undefined)) ??
      (await getErc8183DeliverableUrl(network, id, {
        scanWindow: 2_500n,
        maxWindows: 600,
      }));
    if (!value) {
      return NextResponse.json(
        { error: 'The on-chain submission contains no deliverable URL.' },
        { status: 404 },
      );
    }
    const candidate = new URL(value);
    const manifestText = await fetchDeliverableText(candidate.href);

    const matchedBy = manifestMatch(manifestText, job.deliverable);
    return NextResponse.json({
      verified: matchedBy !== null,
      matchedBy,
      jobId,
      deliverableUrl: candidate.href,
      onchainHash: job.deliverable,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Receipt verification failed: ${logAndPublic('deliverables/verify', error)}` },
      { status: 502 },
    );
  }
}
