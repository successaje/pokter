import { NextResponse } from 'next/server';
import {
  getErc8183DeliverableUrl,
  getErc8183Job,
  verifyErc8183ManifestText,
} from '@altananetwork/sdk';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { assertPublicEndpoint } from '@/lib/proof/prober';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

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

    const value = await getErc8183DeliverableUrl(ALTANA_NETWORK, id);
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
    const pinned =
      candidate.origin === ownOrigin
        ? null
        : await assertPublicEndpoint(candidate.href);
    const deliverableUrl = pinned?.url ?? candidate;

    const init: RequestInit = {
      headers: { accept: 'application/json, text/plain;q=0.9' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    };
    const response = pinned
      ? await pinned.fetch(init)
      : await fetch(deliverableUrl, init);
    if (!response.ok)
      throw new Error(`Deliverable answered ${response.status}`);
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_MANIFEST_BYTES) {
      throw new Error('Deliverable exceeds the 256 KB verification limit');
    }
    const manifestText = await response.text();
    if (
      new TextEncoder().encode(manifestText).byteLength > MAX_MANIFEST_BYTES
    ) {
      throw new Error('Deliverable exceeds the 256 KB verification limit');
    }

    return NextResponse.json({
      verified: verifyErc8183ManifestText(manifestText, job.deliverable),
      jobId,
      deliverableUrl: deliverableUrl.href,
      onchainHash: job.deliverable,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Receipt verification failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
