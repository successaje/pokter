import { NextResponse } from 'next/server';
import { getAddress, verifyMessage, type Hex } from 'viem';

import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { X402_DISABLED, x402Enabled } from '@/lib/x402/flags';
import { effectiveState, readX402Call, recordX402Settlement, type X402Call } from '@/lib/x402/receipts';
import { latestValidBefore, readAuthorizationOnChain, settlementOf, type Settlement } from '@/lib/x402/reconcile';
import { x402Db } from '@/lib/x402/receipts-db';
import { receiptProofMessage } from '@/lib/x402/receipt-proof';

export const dynamic = 'force-dynamic';

/*
 * A pay-per-call receipt, by the authorization's nonce: how a buyer whose
 * connection dropped finds out what happened, instead of paying again.
 *
 * The nonce is not a secret once the payment settles: EIP-3009 emits it on
 * chain. So by nonce alone this says only how the call ended. The answer
 * the buyer paid for, and the wallet's own details, come back only to the
 * wallet that paid, proved by signing `receiptProofMessage(nonce)`.
 */

/*
 * For a call whose reply does not settle it (refused, unknown, or stuck
 * sending), the token is asked whether the payment was taken. A chain that
 * cannot be read is `unread`, never "not taken".
 */
async function settlementFor(call: X402Call, now: number): Promise<Settlement | 'unread' | null> {
  if (call.settlement) return call.settlement;
  const state = effectiveState(call, now);
  if (state !== 'refused' && state !== 'unknown') return null;
  try {
    const settlement = settlementOf(call, await readAuthorizationOnChain(call.payer, call.nonce));
    if (settlement !== 'may-still-settle') recordX402Settlement(x402Db(), call.nonce, settlement, new Date(now).toISOString());
    return settlement;
  } catch {
    return 'unread';
  }
}

const summary = async (call: X402Call, now: number) => ({
  nonce: call.nonce,
  state: effectiveState(call, now),
  httpStatus: call.httpStatus,
  settlementTx: call.settlementTx,
  settlement: await settlementFor(call, now),
  validBefore: latestValidBefore(call),
  amountRaw: call.amountRaw,
  network: call.network,
  createdAt: call.createdAt,
  updatedAt: call.updatedAt,
});

function load(request: Request, nonce: string): { call: X402Call } | NextResponse {
  if (!x402Enabled()) return NextResponse.json(X402_DISABLED, { status: 404 });
  const rate = consumeRateLimit(`x402-receipt:${requestClientKey(request)}`, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  if (!/^0x[0-9a-fA-F]{64}$/.test(nonce)) return NextResponse.json({ error: 'Not a payment nonce.' }, { status: 400 });
  const call = readX402Call(x402Db(), nonce);
  if (!call) return NextResponse.json({ error: 'No paid call with this nonce was sent through Pokter.' }, { status: 404 });
  return { call };
}

export async function GET(request: Request, { params }: { params: Promise<{ nonce: string }> }): Promise<NextResponse> {
  const loaded = load(request, (await params).nonce);
  if (loaded instanceof NextResponse) return loaded;
  return NextResponse.json({ receipt: await summary(loaded.call, Date.now()) }, { headers: { 'cache-control': 'no-store' } });
}

/** The full receipt, answer included, for the wallet that paid. */
export async function POST(request: Request, { params }: { params: Promise<{ nonce: string }> }): Promise<NextResponse> {
  const { nonce } = await params;
  const loaded = load(request, nonce);
  if (loaded instanceof NextResponse) return loaded;
  const body = (await request.json().catch(() => null)) as { signature?: unknown } | null;
  const signature = typeof body?.signature === 'string' && /^0x[0-9a-fA-F]+$/.test(body.signature) ? (body.signature as Hex) : null;
  const valid = signature
    ? await verifyMessage({ address: getAddress(loaded.call.payer), message: receiptProofMessage(nonce), signature }).catch(() => false)
    : false;
  if (!valid) return NextResponse.json({ error: 'Only the wallet that paid can read the answer. Sign the receipt message with it.' }, { status: 403 });
  return NextResponse.json({ receipt: { ...(await summary(loaded.call, Date.now())), payer: loaded.call.payer, endpoint: loaded.call.endpoint, responseText: loaded.call.responseText, error: loaded.call.error } }, { headers: { 'cache-control': 'no-store' } });
}
