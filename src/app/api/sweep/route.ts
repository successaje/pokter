import { NextResponse } from 'next/server';

import { runSweep } from '@/lib/history/sweep';

export const dynamic = 'force-dynamic';
/** A sweep probes the whole roster; it needs more than the default budget. */
export const maxDuration = 300;

/**
 * Scheduled sweep endpoint, for a platform cron (Vercel Cron, GitHub Actions, or
 * plain curl from a host crontab).
 *
 * Guarded by a shared secret: sweeps make outbound requests to third-party
 * agent endpoints, so an open trigger would let anyone use this deployment to
 * generate traffic against them.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.SWEEP_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: 'SWEEP_SECRET is not configured; refusing to run an unguarded sweep.' },
      { status: 503 },
    );
  }

  // Vercel Cron sends the secret as a bearer token.
  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const outcome = await runSweep();
    return NextResponse.json(outcome);
  } catch (error) {
    return NextResponse.json(
      { error: `Sweep failed: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
