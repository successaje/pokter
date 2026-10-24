import { NextResponse } from 'next/server';

import { X402_DISABLED, x402Enabled } from '@/lib/x402/flags';
import { readX402Call } from '@/lib/x402/receipts';
import { x402Db } from '@/lib/x402/receipts-db';

export const dynamic = 'force-dynamic';

/**
 * A pay-per-call receipt, by the authorization's nonce: how a buyer whose
 * connection dropped finds out what happened, instead of paying again. The
 * nonce is 32 random bytes the buyer's own browser chose.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ nonce: string }> }): Promise<NextResponse> {
  if (!x402Enabled()) return NextResponse.json(X402_DISABLED, { status: 404 });
  const { nonce } = await params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(nonce)) return NextResponse.json({ error: 'Not a payment nonce.' }, { status: 400 });
  const call = readX402Call(x402Db(), nonce);
  if (!call) return NextResponse.json({ error: 'No paid call with this nonce was sent through Pokter.' }, { status: 404 });
  return NextResponse.json({ call }, { headers: { 'cache-control': 'no-store' } });
}
