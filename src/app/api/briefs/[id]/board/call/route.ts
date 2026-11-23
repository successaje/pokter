import { NextResponse } from 'next/server';
import { encodeFunctionData, getAddress, isAddress } from 'viem';

import { BOARD_ABI, BOARD_CHAIN_ID } from '@/lib/board/contract';
import { boardRequestStatus } from '@/lib/board/request-server';
import { boardCloseRequestCall } from '@/lib/board/requests';
import { boardContract } from '@/lib/board/server';
import { getBriefStore } from '@/lib/briefs/store';
import { logAndPublic } from '@/lib/api/public-error';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * The PokterBoard call that posts a request, or closes its post, for the
 * poster's own wallet to preview and approve: the path for a wallet that
 * sends transactions from the command line, as an Agentic Wallet does.
 *
 * Unsigned, and returned only once the board would accept it from the
 * request's poster, judged by simulating the poster's own call. After the
 * wallet sends it, `POST /api/briefs/{id}/board/record` checks the
 * transaction and shows the request as posted on the board.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const rate = consumeRateLimit(`brief-board-call:${requestClientKey(request)}`, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const wallet = typeof body?.wallet === 'string' ? body.wallet : '';
  const action = body?.action === 'close' ? 'close' : body?.action === undefined || body?.action === 'post' ? 'post' : null;
  if (!isAddress(wallet, { strict: false }) || !action) {
    return NextResponse.json({ error: 'wallet is required, and action is "post" (the default) or "close".' }, { status: 400 });
  }
  const brief = getBriefStore().get(id);
  if (!brief) return NextResponse.json({ error: 'No such request.' }, { status: 404 });
  if (getAddress(wallet) !== getAddress(brief.poster)) {
    return NextResponse.json({ error: 'Only the wallet that posted this request can post it on PokterBoard or close it there.' }, { status: 403 });
  }
  const board = boardContract();
  if (!board) return NextResponse.json({ error: 'PokterBoard is not open yet.' }, { status: 409 });

  try {
    const status = await boardRequestStatus(brief, board.address);
    if (!status.available) return NextResponse.json({ error: 'PokterBoard is not open yet.' }, { status: 409 });
    let data;
    if (action === 'post') {
      if (status.posted) return NextResponse.json({ error: `This request is already posted on PokterBoard as request #${status.requestId}.` }, { status: 409 });
      if (!status.eligible || !status.call) return NextResponse.json({ error: status.reason ?? 'PokterBoard would not take this post.' }, { status: 409 });
      data = encodeFunctionData({ abi: BOARD_ABI, functionName: 'postRequest', args: [status.call.briefHash, BigInt(status.call.expiresAt)] });
    } else {
      if (!status.posted) return NextResponse.json({ error: 'This request is not posted on PokterBoard, so there is nothing to close.' }, { status: 409 });
      if (!status.canClose) {
        return NextResponse.json(
          { error: status.closed ? 'This request is already closed on PokterBoard.' : status.reason ?? 'The request is still taking proposals on Pokter: withdraw it or choose a proposal first.' },
          { status: 409 },
        );
      }
      const call = boardCloseRequestCall(status.requestId, board.address);
      data = encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args });
    }
    return NextResponse.json({
      call: { binanceChainId: String(BOARD_CHAIN_ID), to: board.address, data, value: '0' },
      preview: `baw contract-call preview --binanceChainId ${BOARD_CHAIN_ID} --from ${getAddress(wallet)} --to ${board.address} --value 0 --inputData ${data} --json`,
      then: `Once the wallet has sent it, POST /api/briefs/${id}/board/record, with the transactionHash when the wallet returned one.`,
    });
  } catch (error) {
    return NextResponse.json({ error: `The call could not be prepared: ${logAndPublic('briefs/board/call', error)}` }, { status: 502 });
  }
}
