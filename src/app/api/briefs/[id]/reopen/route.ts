import { NextResponse } from 'next/server';
import { getAddress, isHex, type Hex } from 'viem';

import { requestHired } from '@/lib/briefs/hired-status';
import { reopenMessage } from '@/lib/briefs/model';
import { getBriefStore } from '@/lib/briefs/store';
import { decisionIsFresh } from '@/lib/jobs/answer-publication';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { signedByWallet } from '@/lib/wallet/signed-by';

export const dynamic = 'force-dynamic';

/**
 * Undo a choice of proposal, before it is hired.
 *
 * Choosing moves no money, so changing one's mind should cost nothing
 * either: the request goes back to open and any proposal can be chosen. It
 * is refused once the chosen proposal has a funded job that was not
 * refunded, because then an agent has been paid to work on it. Signed by
 * the wallet that posted the request, like the choice it undoes.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const rate = consumeRateLimit(`reopen:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many changes just now. Try again shortly.' }, { status: 429 });

  const { id } = await params;
  const store = getBriefStore();
  const brief = store.get(id);
  if (!brief) return NextResponse.json({ error: 'No such request.' }, { status: 404 });
  if (brief.state !== 'awarded' || !brief.awardedBidId) return NextResponse.json({ error: 'No proposal is chosen on this request.' }, { status: 409 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }
  const signature = String(body.signature ?? '');
  const decidedAt = String(body.decidedAt ?? '');
  if (!isHex(signature) || !decisionIsFresh(decidedAt)) {
    return NextResponse.json({ error: 'The signed change is missing or more than ten minutes old. Sign it again.' }, { status: 400 });
  }

  if (requestHired(brief, store.bidsFor(id))) {
    return NextResponse.json({ error: 'The chosen proposal has a funded job, so the choice can no longer be changed. If it is refunded, choose again.' }, { status: 409 });
  }

  const message = reopenMessage(id, brief.awardedBidId, brief.poster, decidedAt);
  if (!(await signedByWallet(brief.chainId, getAddress(brief.poster), message, signature as Hex))) {
    return NextResponse.json({ error: 'Only the wallet that posted this request can change its choice.' }, { status: 403 });
  }

  if (!store.reopen(id, brief.awardedBidId)) return NextResponse.json({ error: 'The request changed while this was signed. Reload and try again.' }, { status: 409 });
  return NextResponse.json({ brief: store.get(id) });
}
