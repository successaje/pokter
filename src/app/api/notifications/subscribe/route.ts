import { NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';

import { ALTANA_NETWORK, altanaNetworkFor } from '@/lib/altana/client';
import { jobChainParam } from '@/lib/jobs/href';
import { createSubscription } from '@/lib/notifications/server';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { BadRequest } from '@/lib/api/public-error';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`notification-subscribe:${requestClientKey(request)}`, { limit: 4, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = String(body.email ?? '').trim().toLowerCase();
    const walletAddress = String(body.walletAddress ?? '').trim();
    const jobId = String(body.jobId ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new BadRequest('Enter a valid email address.');
    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress) || !/^\d+$/.test(jobId)) throw new BadRequest('A valid wallet and job ID are required.');
    // The escrow the job was funded on; older callers only used the default.
    const chainId = jobChainParam(body.chainId === undefined ? undefined : String(body.chainId)) ?? ALTANA_NETWORK.chainId;
    const job = await getErc8183Job(altanaNetworkFor(chainId), BigInt(jobId));
    if (job.client.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: 'That wallet is not the on-chain client for this job.' }, { status: 403 });
    }
    await createSubscription({ email, walletAddress, chainId, jobId, includeAnswer: body.includeAnswer === true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof BadRequest) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('[notifications/subscribe]', error);
    return NextResponse.json({ error: 'Could not start email verification just now. Try again shortly.' }, { status: 502 });
  }
}
