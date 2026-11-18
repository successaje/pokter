import { NextResponse } from 'next/server';

import { BOARD_CHAIN_ID } from '@/lib/board/contract';
import { boardContract, holdsAgentId, simulateBoardReview } from '@/lib/board/server';
import { getReviewStore } from '@/lib/reviews/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { logAndPublic } from '@/lib/api/public-error';

export const dynamic = 'force-dynamic';

/**
 * Whether a saved review can be recorded on PokterBoard by its buyer.
 *
 * `available` says whether a board is set at all; without one, nothing is
 * offered. `eligible` is the board's own answer: the buyer's call is
 * simulated, so every rule the contract enforces is checked by it. The
 * board address comes back so the browser calls the board this server reads.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`review-board:${requestClientKey(request)}`, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const url = new URL(request.url);
  const chainId = Number(url.searchParams.get('chainId'));
  const jobId = url.searchParams.get('jobId') ?? '';
  if (!Number.isInteger(chainId) || !/^\d{1,18}$/.test(jobId)) {
    return NextResponse.json({ error: 'A chain and job id are required.' }, { status: 400 });
  }

  const board = boardContract();
  if (!board) return NextResponse.json({ available: false });

  const review = getReviewStore().get(chainId, jobId);
  if (!review || review.visibility === 'hidden') return NextResponse.json({ error: 'No published review for this job.' }, { status: 404 });
  if (review.boardTx) return NextResponse.json({ available: true, eligible: false, recorded: true, board: board.address, transactionHash: review.boardTx });
  if (review.chainId !== BOARD_CHAIN_ID) {
    return NextResponse.json({ available: true, eligible: false, holder: null, reason: 'PokterBoard records reviews of jobs funded on BNB Smart Chain mainnet.' });
  }

  try {
    if (!(await holdsAgentId(review.buyer))) {
      return NextResponse.json({ available: true, eligible: false, holder: false, reason: 'The wallet that funded this job holds no Agent ID.' });
    }
    const verdict = await simulateBoardReview(review, board.address);
    return NextResponse.json(
      verdict.ok
        ? { available: true, eligible: true, holder: true, board: board.address }
        : { available: true, eligible: false, holder: true, reason: verdict.reason },
    );
  } catch (error) {
    return NextResponse.json({ error: `PokterBoard could not be read: ${logAndPublic('reviews/board', error)}` }, { status: 502 });
  }
}
