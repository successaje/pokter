import { NextResponse } from 'next/server';
import {
  getErc8183DeliverableUrl,
  getErc8183Job,
  verifyErc8183ManifestText,
} from '@altananetwork/sdk';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { getJobStore } from '@/lib/erc8183/store';
import { readDeliverable } from '@/lib/erc8183/deliverables';
import { erc8183ManifestHash } from '@altananetwork/sdk';
import { withPublicEndpoint } from '@/lib/proof/prober';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
/*
 * The fallback scan below walks back through block windows, so this can take
 * meaningfully longer than a cached read when the index has no answer.
 */
export const maxDuration = 60;

const MAX_MANIFEST_BYTES = 256 * 1024;

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

  try {
    const id = BigInt(jobId);
    const job = await getErc8183Job(ALTANA_NETWORK, id);
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
     * read, and the manifest it points at is still verified byte-for-byte
     * against the on-chain hash below — nothing here is taken on trust, only
     * remembered.
     */
    const indexed = getJobStore()
      .all()
      .find(
        (job) =>
          job.chainId === ALTANA_NETWORK.chainId && job.jobId === jobId,
      )?.deliverableUrl;

    /*
     * For a deliverable Pokter's own seller submitted, the URL is derivable
     * and needs no chain scan at all: it is `/api/seller/deliverables/<id>`
     * with the manifest hash as a query parameter, and the manifest bytes are
     * already stored here from before the submission was sent. Rebuilding it
     * is exact rather than approximate — the hash is recomputed from the same
     * bytes the chain committed to, and the check below still proves that.
     */
    const stored = readDeliverable(jobId);
    const derived = stored
      ? (() => {
          try {
            const url = new URL(
              `/api/seller/deliverables/${jobId}`,
              process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4311',
            );
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
       * Wider windows than the SDK's default for the same total work: it
       * stops as soon as it scans past the submission, so a recent job still
       * costs a couple of calls while an older one stays reachable instead of
       * falling off a one-week cliff. 5,000 is chosen to sit under the range
       * cap public BSC RPCs apply to eth_getLogs.
       */
      (await getErc8183DeliverableUrl(ALTANA_NETWORK, id, {
        scanWindow: 5_000n,
        maxWindows: 300,
      }));
    if (!value) {
      return NextResponse.json(
        { error: 'The on-chain submission contains no deliverable URL.' },
        { status: 404 },
      );
    }
    const candidate = new URL(value);
    const ownOrigin = new URL(
      process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4311',
    ).origin;
    // Our own origin needs no SSRF check; anything else is validated and then
    // pinned to the address that was checked (POK-008).
    const init: RequestInit = {
      headers: { accept: 'application/json, text/plain;q=0.9' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    };
    const readManifest = async (response: Response): Promise<string> => {
      if (!response.ok)
        throw new Error(`Deliverable answered ${response.status}`);
      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (declaredLength > MAX_MANIFEST_BYTES)
        throw new Error('Deliverable exceeds the 256 KB verification limit');
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_MANIFEST_BYTES)
        throw new Error('Deliverable exceeds the 256 KB verification limit');
      return text;
    };
    const manifestText =
      candidate.origin === ownOrigin
        ? await readManifest(await fetch(candidate, init))
        : await withPublicEndpoint(candidate.href, async (pinned) =>
            readManifest(await pinned.fetch(init)),
          );

    return NextResponse.json({
      verified: verifyErc8183ManifestText(manifestText, job.deliverable),
      jobId,
      deliverableUrl: candidate.href,
      onchainHash: job.deliverable,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Receipt verification failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
