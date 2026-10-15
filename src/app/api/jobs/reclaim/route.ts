import { NextResponse } from 'next/server';

import { reclaimJob } from '@/lib/erc8183/hire';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Pull an expired escrow back to the wallet Pokter funds its own hires from.
 *
 * A buyer reclaims from their own wallet in the UI. Pokter's own hires —
 * fixture checks, lifecycle demonstrations, script hires — are funded by
 * the admin signer, which no interface can sign for, so their budgets sat
 * in escrow after expiry with no way to recover them.
 *
 * Operator-only, and deliberately one job at a time: a reclaim is a
 * transaction against real escrow, and a loop over "everything expired" is
 * the kind of convenience that eventually sends one it should not have.
 * Nothing here runs on a schedule.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.SWEEP_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { jobId?: unknown };
  const jobId = typeof body.jobId === 'number' ? String(body.jobId) : typeof body.jobId === 'string' ? body.jobId : '';
  if (!/^\d{1,12}$/.test(jobId)) {
    return NextResponse.json({ error: 'A numeric jobId is required.' }, { status: 400 });
  }

  try {
    const reclaimed = await reclaimJob(jobId);
    return NextResponse.json({ reclaimed: true, ...reclaimed });
  } catch (error) {
    /*
     * 409 rather than 500: "not expired yet", "funded by another wallet"
     * and "nothing left to reclaim" are all true answers about the job,
     * not failures of this endpoint.
     */
    return NextResponse.json({ reclaimed: false, error: (error as Error).message }, { status: 409 });
  }
}
