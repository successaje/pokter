import { NextResponse } from 'next/server';
import { getAddress, isHash, type Hex } from 'viem';

import { readBoardRequestTx, requestBriefHash } from '@/lib/board/requests';
import { boardContract, findBoardRequestTransaction, readBoardTransaction } from '@/lib/board/server';
import { getBriefStore } from '@/lib/briefs/store';
import { logAndPublic } from '@/lib/api/public-error';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Show a request as posted on PokterBoard, or its post as closed, once its
 * poster's wallet has sent the transaction.
 *
 * Nothing the caller says is trusted beyond which transaction to look at:
 * it must come from the request's poster, be sent to the board, post
 * exactly this request's signed text or close its post, and be confirmed
 * by the board's own event (`readBoardRequestTx`). With no transaction
 * given, the last hour or so of the board's events is searched for it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const rate = consumeRateLimit(`brief-board-record:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const given = typeof body?.transactionHash === 'string' ? body.transactionHash : null;
  if (given !== null && !isHash(given)) return NextResponse.json({ error: 'transactionHash, when given, is a 32-byte hash.' }, { status: 400 });

  const store = getBriefStore();
  const brief = store.get(id);
  if (!brief) return NextResponse.json({ error: 'No such request.' }, { status: 404 });
  const board = boardContract();
  if (!board) return NextResponse.json({ error: 'PokterBoard is not open yet.' }, { status: 409 });
  if (brief.board?.closedTx) return NextResponse.json({ recorded: true, board: brief.board });

  try {
    const hash =
      (given as Hex | null) ??
      (await findBoardRequestTransaction(
        board.address,
        brief.board ? { close: { requestId: BigInt(brief.board.requestId) } } : { post: { poster: getAddress(brief.poster), briefHash: requestBriefHash(brief) } },
      ));
    if (!hash) {
      return NextResponse.json(
        { error: `No ${brief.board ? 'close' : 'post'} of this request is on PokterBoard yet. If the wallet asked for approval in the Binance App, approve it there, then ask again; or pass the transactionHash.` },
        { status: 404 },
      );
    }
    const sent = await readBoardTransaction(hash);
    const reading = readBoardRequestTx({ request: brief, board: board.address, tx: { from: sent.from, to: sent.to, input: sent.input }, succeeded: sent.succeeded, logs: sent.logs });
    if (!reading.ok) return NextResponse.json({ error: reading.error }, { status: reading.status });
    /* Each write happens once: a second post of the same text leaves the request linked to the first. */
    if (reading.action === 'post') store.recordBoardPost(id, { requestId: reading.requestId, tx: hash, expiresAt: reading.expiresAt });
    else store.recordBoardClose(id, hash);
    return NextResponse.json({ recorded: true, board: store.get(id)?.board ?? null });
  } catch (error) {
    return NextResponse.json({ error: `The transaction could not be checked: ${logAndPublic('briefs/board/record', error)}` }, { status: 502 });
  }
}
