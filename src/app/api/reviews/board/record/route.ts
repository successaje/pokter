import { NextResponse } from 'next/server';
import { createPublicClient, getAbiItem, isHash, type Hex } from 'viem';
import { bsc } from 'viem/chains';

import { altanaNetworkFor } from '@/lib/altana/client';
import { verifyBoardReview } from '@/lib/board/agent-review';
import { BOARD_ABI, BOARD_CHAIN_ID, reviewedProvider } from '@/lib/board/contract';
import { refreshBoardRatings } from '@/lib/board/ratings';
import { boardContract } from '@/lib/board/server';
import { readTransport } from '@/lib/chain/rpc';
import { publicReadUrls } from '@/lib/chain/transport';
import { historyClient } from '@/lib/erc8183/history-client';
import { getErc8183Job } from '@/lib/erc8183/job-read';
import { jobAgentIdentity } from '@/lib/reviews/job-identity';
import { validReviewContent } from '@/lib/reviews/model';
import { getReviewStore } from '@/lib/reviews/store';
import { logAndPublic } from '@/lib/api/public-error';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/*
 * How far back a review is looked for when the wallet returned no
 * transaction, as when its owner approved it later in the Binance App:
 * about an hour of blocks, as far as public nodes serve logs.
 */
const RECENT_BLOCKS = 8_000n;

/**
 * Show a review the buyer wrote on PokterBoard from their own wallet.
 *
 * Nothing the caller says is trusted beyond which job and what the review
 * says: the transaction must come from the wallet that funded the job, be
 * the board's `review` of that job, and carry exactly these stars, these
 * answers and the hash of this comment (`verifyBoardReview`). The comment's
 * text is shown only because it hashes to what the buyer recorded.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`review-board-record:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const chainId = Number(body?.chainId ?? BOARD_CHAIN_ID);
  const jobId = String(body?.jobId ?? '');
  const given = typeof body?.transactionHash === 'string' ? body.transactionHash : null;
  if (!/^\d{1,18}$/.test(jobId) || !validReviewContent(body?.content) || (given !== null && !isHash(given))) {
    return NextResponse.json({ error: 'jobId and content are required, exactly as sent to /api/reviews/board/call; transactionHash is optional.' }, { status: 400 });
  }
  const board = boardContract();
  if (!board) return NextResponse.json({ error: 'PokterBoard is not open yet.' }, { status: 409 });

  const store = getReviewStore();
  const existing = store.get(chainId, jobId);
  if (existing?.proof === 'board' && existing.boardTx) return NextResponse.json({ recorded: true, review: existing });

  try {
    const client = createPublicClient({ chain: bsc, transport: readTransport(BOARD_CHAIN_ID, publicReadUrls(BOARD_CHAIN_ID, process.env.BSC_MAINNET_RPC_URL)) });
    const hash = (given as Hex | null) ?? (await findReviewTransaction(board.address, BigInt(jobId)));
    if (!hash) {
      return NextResponse.json(
        { error: `No review of job #${jobId} is on PokterBoard yet. If the wallet asked for approval in the Binance App, approve it there, then ask again; or pass the transactionHash.` },
        { status: 404 },
      );
    }
    const [tx, receipt, job] = await Promise.all([
      client.getTransaction({ hash }),
      client.getTransactionReceipt({ hash }),
      getErc8183Job(altanaNetworkFor(chainId), BigInt(jobId)),
    ]);
    const verdict = verifyBoardReview({
      chainId,
      jobId,
      content: body!.content as never,
      board: board.address,
      job,
      identity: jobAgentIdentity(chainId, jobId, job.description),
      tx: { from: tx.from, to: tx.to, input: tx.input, succeeded: receipt.status === 'success' },
    });
    if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: verdict.status });
    store.saveBoardReview({ ...verdict.review, boardTx: hash });
    const provider = reviewedProvider(receipt.logs, board.address);
    if (provider) await refreshBoardRatings({ wallets: [provider] }).catch(() => null);
    return NextResponse.json({ recorded: true, review: store.get(chainId, jobId) });
  } catch (error) {
    return NextResponse.json({ error: `The review could not be checked: ${logAndPublic('reviews/board/record', error)}` }, { status: 502 });
  }
}

/* The board's `Reviewed` log for this job in the last hour or so of blocks, read where old logs are served. */
async function findReviewTransaction(board: Hex, jobId: bigint): Promise<Hex | null> {
  const client = historyClient(BOARD_CHAIN_ID);
  const latest = await client.getBlockNumber();
  const logs = await client.getLogs({
    address: board,
    event: getAbiItem({ abi: BOARD_ABI, name: 'Reviewed' }),
    args: { jobId },
    fromBlock: latest > RECENT_BLOCKS ? latest - RECENT_BLOCKS : 0n,
    toBlock: latest,
  });
  return logs.at(-1)?.transactionHash ?? null;
}
