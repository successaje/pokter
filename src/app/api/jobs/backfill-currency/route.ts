import { randomUUID, timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { backfillJobCurrencies } from '@/lib/erc8183/currency-backfill';
import { jobPaymentTokenOnChain } from '@/lib/erc8183/job-onchain';
import { getJobStore } from '@/lib/erc8183/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Read each unknown job's token from the escrow (`jobPaymentToken`) and,
 * with `{"write": true}`, store it. Dry by default, and behind the sweep
 * secret like the other repairs to the index.
 *
 * Resumable: rows are taken in a stable order after `after` (a row id), and
 * the response's `nextCursor` continues the run; repeating a page is
 * harmless, because a token is only ever written where none is recorded. A
 * write run records one audit line per job under its `runId` — written,
 * already set, or unread with the reason — in `currency_backfill_audit`.
 * A read that fails leaves the row unknown; nothing is defaulted to $U.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.SWEEP_SECRET;
  if (!secret) return NextResponse.json({ error: 'SWEEP_SECRET is not configured.' }, { status: 503 });
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  /* Compared in constant time: the secret guards a write to every job's currency. */
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { write?: unknown; limit?: unknown; after?: unknown; runId?: unknown };
  const limit = Number.isInteger(body.limit) && (body.limit as number) > 0 ? Math.min(body.limit as number, 500) : 200;
  const after = typeof body.after === 'string' ? body.after : null;
  const write = body.write === true;
  const runId = typeof body.runId === 'string' && /^[\w-]{1,64}$/.test(body.runId) ? body.runId : randomUUID();
  const store = getJobStore();
  const page = store.withoutPaymentToken(after, limit);
  const at = new Date().toISOString();
  const report = await backfillJobCurrencies({
    rows: page.map((job) => ({ chainId: job.chainId, jobId: job.jobId })),
    read: jobPaymentTokenOnChain,
    write,
    set: (chainId, jobId, token) => store.setPaymentToken(chainId, jobId, token),
    audit: (entry) => store.auditCurrencyBackfill({ runId, at, ...entry }),
  });
  const nextCursor = page.length === limit ? page[page.length - 1].id : null;
  return NextResponse.json(
    { runId, ...report, nextCursor, remainingUnknown: store.withoutPaymentToken().length },
    { headers: { 'cache-control': 'no-store' } },
  );
}
