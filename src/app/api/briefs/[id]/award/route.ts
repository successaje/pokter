import { NextResponse } from 'next/server';
import { getAddress } from 'viem';

import { posterDecided, readDecisionSignature } from '@/lib/briefs/decision-signature';
import { chooseTypedData } from '@/lib/briefs/decision-typed';
import { awardMessage } from '@/lib/briefs/model';
import { fundsAboveBudget } from '@/lib/briefs/proposal-price';
import { getBriefStore } from '@/lib/briefs/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

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
 *
 * The signature is over the plain message a browser wallet signs, or, with
 * `format: 'eip712'`, over the same choice as typed data, from a wallet
 * that signs nothing else (`/api/briefs/{id}/decision` hands it out).
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
  const signed = readDecisionSignature(body);
  const bid = store.bid(bidId);
  if (!bid || bid.briefId !== id) return NextResponse.json({ error: 'That bid is not on this brief.' }, { status: 400 });
  if (!signed) return NextResponse.json({ error: 'A signature is needed: the poster’s, over the plain message or, with format "eip712", over the typed data.' }, { status: 400 });

  /* Above the budget, the amount the poster agrees to is part of what they sign. */
  const above = fundsAboveBudget(bid, brief);
  const message = awardMessage(id, bidId, brief.poster, above);
  if (!(await posterDecided(brief.chainId, getAddress(brief.poster), { text: message, typed: chooseTypedData(id, bidId, brief.poster, above) }, signed))) {
    return NextResponse.json({ error: 'Only the wallet that posted this brief can award it.' }, { status: 403 });
  }

  store.award(id, bidId);
  return NextResponse.json({ brief: store.get(id), bid });
}
