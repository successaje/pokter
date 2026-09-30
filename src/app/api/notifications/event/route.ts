import { NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { notifyJobEvent } from '@/lib/notifications/server';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`notification-event:${requestClientKey(request)}`, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const jobId = String(body.jobId ?? '');
    if (!/^\d+$/.test(jobId)) throw new Error('A numeric job ID is required.');
    const job = await getErc8183Job(ALTANA_NETWORK, BigInt(jobId));
    const result = await notifyJobEvent({
      chainId: ALTANA_NETWORK.chainId,
      jobId,
      status: job.statusName,
      agentName: typeof body.agentName === 'string' ? body.agentName.slice(0, 100) : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Could not process the job update.' }, { status: 400 });
  }
}
