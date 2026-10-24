import { NextResponse } from 'next/server';

import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { X402_DISABLED, x402Enabled } from '@/lib/x402/flags';
import { readX402Terms, x402EndpointFor } from '@/lib/x402/seller';

export const dynamic = 'force-dynamic';

/** What one paid call to this agent costs, read from its own challenge. Pays nothing. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!x402Enabled()) return NextResponse.json(X402_DISABLED, { status: 404 });
  const rate = consumeRateLimit(`x402-terms:${requestClientKey(request)}`, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  const params = new URL(request.url).searchParams;
  const chainId = Number(params.get('chainId'));
  const tokenId = params.get('tokenId') ?? '';
  const endpoint = await x402EndpointFor(chainId, tokenId).catch(() => null);
  if (!endpoint) return NextResponse.json({ supported: false, reason: 'This agent registers no x402 endpoint on BNB Chain.' }, { headers: { 'cache-control': 'no-store' } });
  const choice = await readX402Terms(endpoint).catch(() => ({ ok: false as const, reason: 'The seller could not be reached just now.', offered: [] }));
  return NextResponse.json(choice.ok ? { supported: true, terms: choice.terms } : { supported: false, reason: choice.reason, offered: choice.offered }, { headers: { 'cache-control': 'no-store' } });
}
