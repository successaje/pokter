import { NextResponse } from 'next/server';

import { originOf } from '@/lib/api/origin';
import { logAndPublic } from '@/lib/api/public-error';
import { prepareBoardRequest } from '@/lib/board/new-request';
import { boardContract } from '@/lib/board/server';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * The PokterBoard call that posts a new request from its poster's own
 * wallet, for a wallet that signs no plain message, as an Agentic Wallet
 * does not (`lib/board/new-request.ts`). The post is the request's proof:
 * the wallet records keccak256 of the request's text on the board.
 *
 * Unsigned, and returned only once the board would take it from that
 * wallet, judged by simulating its own call: it must hold an Agent ID.
 * The answer carries the exact `text` the post commits to, for its owner
 * to read before approving. Nothing is stored here: after the wallet sends
 * it, `POST /api/briefs/board/record` with the answer's `record` checks
 * the transaction and publishes the request.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`brief-board-new:${requestClientKey(request)}`, { limit: 5, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Expected a JSON body: { poster, content }.' }, { status: 400 });

  try {
    const prepared = await prepareBoardRequest({ poster: body.poster, content: body.content }, boardContract()?.address ?? null);
    if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: prepared.status });
    const { call, record } = prepared;
    return NextResponse.json({
      id: prepared.id,
      page: `${originOf(request)}/requests/${prepared.id}`,
      text: prepared.text,
      briefHash: prepared.briefHash,
      expiresAt: prepared.expiresAt,
      call,
      preview: `baw contract-call preview --binanceChainId ${call.binanceChainId} --from ${record.poster} --to ${call.to} --value 0 --inputData ${call.data} --json`,
      record,
      then: 'Once the wallet has sent it, POST /api/briefs/board/record with `record` as the body, adding transactionHash when the wallet returned one. The request is public only after that.',
    });
  } catch (error) {
    return NextResponse.json({ error: `The call could not be prepared: ${logAndPublic('briefs/board/new-call', error)}` }, { status: 502 });
  }
}
