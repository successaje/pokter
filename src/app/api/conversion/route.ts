import { NextResponse } from 'next/server';

import { isConversionEvent } from '@/lib/conversion/funnel';
import { recordConversion } from '@/lib/conversion/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`conversion:${requestClientKey(request)}`, { limit: 60, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many conversion events.' }, { status: 429 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const chainId = Number(body?.chainId);
  const tokenId = String(body?.tokenId ?? '');
  const escrowChainId = body?.escrowChainId === null || body?.escrowChainId === undefined ? null : Number(body.escrowChainId);
  if (!body || !isConversionEvent(body.event) || (chainId !== 56 && chainId !== 97) || !/^\d{1,12}$/.test(tokenId)) {
    return NextResponse.json({ error: 'Invalid conversion event.' }, { status: 400 });
  }
  if (escrowChainId !== null && escrowChainId !== 56 && escrowChainId !== 97) {
    return NextResponse.json({ error: 'Invalid escrow chain.' }, { status: 400 });
  }
  try {
    recordConversion({ event: body.event, chainId, tokenId, escrowChainId });
  } catch {
    // A count that could not be written is a lost count, not a broken hire page.
    return new NextResponse(null, { status: 503 });
  }
  return new NextResponse(null, { status: 204 });
}
