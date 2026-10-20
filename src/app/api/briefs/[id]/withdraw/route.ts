import { NextResponse } from 'next/server';
import { getAddress, isHex, type Hex } from 'viem';

import { withdrawMessage } from '@/lib/briefs/model';
import { getBriefStore } from '@/lib/briefs/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { signedByWallet } from '@/lib/wallet/signed-by';

export const dynamic = 'force-dynamic';

/**
 * Withdraw a request.
 *
 * Signed by the wallet that posted it, like the award, so only its poster
 * can take it down. Withdrawn is a state, not a deletion: the request and
 * any proposals on it stay readable at their address, marked withdrawn,
 * because a builder who answered it should be able to see what happened
 * to it. Only an open request can be withdrawn; once one is awarded, a
 * builder is waiting on the hire.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const rate = consumeRateLimit(`withdraw:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests just now. Try again shortly.' }, { status: 429 });

  const { id } = await params;
  const store = getBriefStore();
  const brief = store.get(id);
  if (!brief) return NextResponse.json({ error: 'No such request.' }, { status: 404 });
  if (brief.state !== 'open') return NextResponse.json({ error: 'Only an open request can be withdrawn.' }, { status: 409 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }
  const signature = String(body.signature ?? '');
  if (!isHex(signature)) return NextResponse.json({ error: 'A signature is needed.' }, { status: 400 });

  if (!(await signedByWallet(brief.chainId, getAddress(brief.poster), withdrawMessage(id, brief.poster), signature as Hex))) {
    return NextResponse.json({ error: 'Only the wallet that posted this request can withdraw it.' }, { status: 403 });
  }

  store.withdraw(id);
  return NextResponse.json({ brief: store.get(id) });
}
