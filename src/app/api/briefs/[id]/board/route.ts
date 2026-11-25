import { NextResponse } from 'next/server';

import { boardRequestStatus } from '@/lib/board/request-server';
import { boardContract } from '@/lib/board/server';
import { getBriefStore } from '@/lib/briefs/store';
import { logAndPublic } from '@/lib/api/public-error';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Where a request stands on PokterBoard (`boardRequestStatus`): posted or
 * not, and whether its poster can post or close it there now.
 *
 * `available` says whether a board is set at all; without one, nothing is
 * offered. The board's address comes back so the poster's wallet calls the
 * board this server reads.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const rate = consumeRateLimit(`brief-board:${requestClientKey(request)}`, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const brief = getBriefStore().get((await params).id);
  if (!brief) return NextResponse.json({ error: 'No such request.' }, { status: 404 });
  try {
    return NextResponse.json(await boardRequestStatus(brief, boardContract()?.address ?? null));
  } catch (error) {
    return NextResponse.json({ error: `PokterBoard could not be read: ${logAndPublic('briefs/board', error)}` }, { status: 502 });
  }
}
