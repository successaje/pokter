import { NextResponse } from 'next/server';

import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { runX402Call, type CallOutcome } from '@/lib/x402/call';
import type { X402Terms } from '@/lib/x402/exact';
import { X402_DISABLED, x402Enabled } from '@/lib/x402/flags';
import { x402Db } from '@/lib/x402/receipts-db';
import { readX402Terms, sendX402, x402EndpointFor } from '@/lib/x402/seller';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

/* Only an answer is a 2xx. A refusal or an unknown outcome must not read as success to a script. */
const STATUS: Record<CallOutcome['kind'], number> = {
  answered: 200,
  refused: 502,
  unknown: 504,
  'not-sent': 502,
  'already-sent': 409,
  'terms-changed': 409,
  unavailable: 503,
  invalid: 400,
};

/**
 * Forward one paid call the buyer signed in their own wallet. Pokter holds
 * no key and signs nothing: it checks the signed authorization against the
 * seller's fresh terms, sends it once, and keeps the receipt. See `runX402Call`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!x402Enabled()) return NextResponse.json(X402_DISABLED, { status: 404 });
  const rate = consumeRateLimit(`x402-call:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many paid calls from this connection. Try again shortly.' }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { chainId?: unknown; tokenId?: unknown; terms?: Partial<X402Terms>; header?: { name?: unknown; value?: unknown }; body?: unknown } | null;
  const chainId = Number(body?.chainId);
  const tokenId = String(body?.tokenId ?? '');
  const agreed = body?.terms;
  const header = body?.header;
  const payload = typeof body?.body === 'string' ? body.body : '';
  if (!agreed || typeof agreed.payTo !== 'string' || typeof agreed.amountRaw !== 'string' || typeof agreed.endpoint !== 'string' || typeof header?.name !== 'string' || typeof header?.value !== 'string' || header.value.length > 4_000) {
    return NextResponse.json({ error: 'Send the terms you agreed to, the signed payment header and the request body.' }, { status: 400 });
  }
  if (payload.length > 8_000) return NextResponse.json({ error: 'The request body must be at most 8,000 characters.' }, { status: 400 });
  const endpoint = await x402EndpointFor(chainId, tokenId).catch(() => null);
  if (!endpoint) return NextResponse.json({ error: 'This agent registers no x402 endpoint on BNB Chain. Nothing was sent.' }, { status: 404 });

  const outcome = await runX402Call({
    db: x402Db(),
    agreed: agreed as X402Terms,
    agent: { chainId, tokenId },
    header: { name: header.name, value: header.value },
    body: payload,
    readFresh: () => readX402Terms(endpoint),
    send: (headers, sent) => sendX402(endpoint, headers, sent),
  });
  return NextResponse.json(outcome, { status: STATUS[outcome.kind], headers: { 'cache-control': 'no-store' } });
}
