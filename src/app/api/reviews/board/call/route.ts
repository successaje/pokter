import { NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';

import { altanaNetworkFor } from '@/lib/altana/client';
import { prepareBoardReview } from '@/lib/board/agent-review';
import { BOARD_CHAIN_ID } from '@/lib/board/contract';
import { boardContract, holdsAgentId, simulateBoardReview } from '@/lib/board/server';
import { getErc8183Job } from '@/lib/erc8183/job-read';
import { jobAgentIdentity } from '@/lib/reviews/job-identity';
import { validReviewContent } from '@/lib/reviews/model';
import { logAndPublic } from '@/lib/api/public-error';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * The PokterBoard call that records a buyer's review of a job, for the
 * buyer's own wallet to preview and approve: the review path for a wallet
 * that signs typed data only, as an Agentic Wallet does
 * (`lib/board/agent-review.ts`).
 *
 * Unsigned. It is returned only once the board would accept it from this
 * wallet, judged by simulating the wallet's own call. After the wallet sends
 * it, `POST /api/reviews/board/record` checks the transaction and shows the
 * review on the agent's page.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`review-board-call:${requestClientKey(request)}`, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const chainId = Number(body?.chainId ?? BOARD_CHAIN_ID);
  const jobId = String(body?.jobId ?? '');
  const wallet = typeof body?.wallet === 'string' ? body.wallet : '';
  if (!/^\d{1,18}$/.test(jobId) || !isAddress(wallet, { strict: false }) || !validReviewContent(body?.content)) {
    return NextResponse.json(
      { error: 'jobId, wallet and content are required. content is { rating: 1-5, deliveredAsPromised: boolean, speed: "early" | "on-time" | "late", wouldHireAgain: boolean, comment: up to 500 characters }.' },
      { status: 400 },
    );
  }
  const board = boardContract();
  if (!board) return NextResponse.json({ error: 'PokterBoard is not open yet.' }, { status: 409 });

  try {
    const job = await getErc8183Job(altanaNetworkFor(chainId), BigInt(jobId));
    const result = await prepareBoardReview({
      chainId,
      jobId,
      wallet: getAddress(wallet),
      content: body!.content as never,
      board: board.address,
      job,
      identity: jobAgentIdentity(chainId, jobId, job.description),
      holdsAgentId: (address) => holdsAgentId(address),
      simulate: (review) => simulateBoardReview(review, board.address),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      call: { binanceChainId: String(BOARD_CHAIN_ID), ...result.call },
      expect: result.expect,
      preview: `baw contract-call preview --binanceChainId ${BOARD_CHAIN_ID} --from ${getAddress(wallet)} --to ${result.call.to} --value 0 --inputData ${result.call.data} --json`,
      then: 'Once the wallet has sent it, POST /api/reviews/board/record with the same chainId, jobId and content, and the transactionHash when the wallet returned one.',
    });
  } catch (error) {
    return NextResponse.json({ error: `The review could not be prepared: ${logAndPublic('reviews/board/call', error)}` }, { status: 502 });
  }
}
