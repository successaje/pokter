import { NextResponse } from 'next/server';
import { getAddress, isHex, type Hex } from 'viem';

import { awardMessage } from '@/lib/briefs/model';
import { fundsAboveBudget } from '@/lib/briefs/proposal-price';
import { getBriefStore } from '@/lib/briefs/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { signedByWallet } from '@/lib/wallet/signed-by';

export const dynamic = 'force-dynamic';

/**
 * Accept a bid.
 *
 * This moves no money and funds nothing. It records that the poster chose
 * a bid, signed by the same wallet that signed the brief, and the hire that
 * follows runs through the ordinary escrow flow with the agent and price
 * filled in. Awarding and paying are kept apart deliberately: an award is a
 * statement of intent, and nothing on this site should be able to take
 * funds from a wallet without that wallet signing the transaction itself.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const rate = consumeRateLimit(`award:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many awards just now. Try again shortly.' }, { status: 429 });

  const { id } = await params;
  const store = getBriefStore();
  const brief = store.get(id);
  if (!brief) return NextResponse.json({ error: 'No such brief.' }, { status: 404 });
  if (brief.state !== 'open') return NextResponse.json({ error: 'This brief has already been settled.' }, { status: 409 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const bidId = String(body.bidId ?? '');
  const signature = String(body.signature ?? '');
  const bid = store.bid(bidId);
  if (!isHex(signature) || !bid || bid.briefId !== id) {
    return NextResponse.json({ error: 'That bid is not on this brief.' }, { status: 400 });
  }

  /* Above the budget, the amount the poster agrees to is part of what they sign. */
  const message = awardMessage(id, bidId, brief.poster, fundsAboveBudget(bid, brief));
  if (!(await signedByWallet(brief.chainId, getAddress(brief.poster), message, signature as Hex))) {
    return NextResponse.json({ error: 'Only the wallet that posted this brief can award it.' }, { status: 403 });
  }

  store.award(id, bidId);
  return NextResponse.json({ brief: store.get(id), bid });
}
