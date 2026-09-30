import { NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { createSubscription } from '@/lib/notifications/server';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`notification-subscribe:${requestClientKey(request)}`, { limit: 4, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = String(body.email ?? '').trim().toLowerCase();
    const walletAddress = String(body.walletAddress ?? '').trim();
    const jobId = String(body.jobId ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress) || !/^\d+$/.test(jobId)) throw new Error('A valid wallet and job ID are required.');
    const job = await getErc8183Job(ALTANA_NETWORK, BigInt(jobId));
    if (job.client.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: 'That wallet is not the on-chain client for this job.' }, { status: 403 });
    }
    await createSubscription({ email, walletAddress, chainId: ALTANA_NETWORK.chainId, jobId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Could not start email verification.' }, { status: 400 });
  }
}
