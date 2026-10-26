import { NextResponse } from 'next/server';

import { backfillJobCurrencies } from '@/lib/erc8183/currency-backfill';
import { jobPaymentTokenOnChain } from '@/lib/erc8183/job-onchain';
import { getJobStore } from '@/lib/erc8183/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Read each unknown job's token from the escrow (`jobPaymentToken`) and,
 * with `{"write": true}`, store it. Dry by default, and behind the sweep
 * secret like the other repairs to the index. A read that fails leaves the
 * row unknown and is listed; nothing is defaulted to $U.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.SWEEP_SECRET;
  if (!secret) return NextResponse.json({ error: 'SWEEP_SECRET is not configured.' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { write?: unknown; limit?: unknown };
  const limit = Number.isInteger(body.limit) && (body.limit as number) > 0 ? Math.min(body.limit as number, 500) : 200;
  const store = getJobStore();
  const report = await backfillJobCurrencies({
    rows: store.withoutPaymentToken().slice(0, limit).map((job) => ({ chainId: job.chainId, jobId: job.jobId })),
    read: jobPaymentTokenOnChain,
    write: body.write === true,
    set: (chainId, jobId, token) => store.setPaymentToken(chainId, jobId, token),
  });
  return NextResponse.json({ ...report, remainingUnknown: store.withoutPaymentToken().length }, { headers: { 'cache-control': 'no-store' } });
}
