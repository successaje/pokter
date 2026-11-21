import { NextResponse } from 'next/server';
import { createPublicClient, fallback, http, isHash, type Hex } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { BOARD_CHAIN_ID, matchesBoardReview, reviewedProvider } from '@/lib/board/contract';
import { refreshBoardRatings } from '@/lib/board/ratings';
import { boardContract } from '@/lib/board/server';
import { matchesFeedback } from '@/lib/reviews/onchain';
import { getReviewStore } from '@/lib/reviews/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { siteUrl } from '@/lib/site';
import { logAndPublic } from '@/lib/api/public-error';

export const dynamic = 'force-dynamic';

const CHAINS = {
  /* Two nodes each: the public node sometimes refuses a fresh receipt as "archive" data. */
  56: { chain: bsc, rpc: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.bnbchain.org'] },
  97: { chain: bscTestnet, rpc: ['https://bsc-testnet-rpc.publicnode.com', 'https://data-seed-prebsc-1-s1.bnbchain.org:8545'] },
} as const;

/**
 * Record that a review was published on chain: to the ERC-8004 Reputation
 * Registry by default, or to PokterBoard with `target: 'board'`.
 *
 * The transaction is read from chain and must be the buyer's own call for
 * this review: giveFeedback on the agent's chain (matchesFeedback), or the
 * board's `review` on BNB Smart Chain (matchesBoardReview). Nothing the
 * caller says beyond the job, the target and the hash is trusted.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`review-onchain:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { chainId?: unknown; jobId?: unknown; transactionHash?: unknown; target?: unknown };
  const toBoard = body.target === 'board';
  const chainId = Number(body.chainId);
  const jobId = String(body.jobId ?? '');
  const hash = String(body.transactionHash ?? '');
  if (!Number.isInteger(chainId) || !/^\d{1,18}$/.test(jobId) || !isHash(hash)) {
    return NextResponse.json({ error: 'A chain, job id and transaction hash are required.' }, { status: 400 });
  }

  const store = getReviewStore();
  const review = store.get(chainId, jobId);
  if (!review || review.visibility === 'hidden') return NextResponse.json({ error: 'No published review for this job.' }, { status: 404 });
  const board = toBoard ? boardContract() : null;
  if (toBoard && !board) return NextResponse.json({ error: 'No PokterBoard is set.' }, { status: 409 });
  const network = CHAINS[(toBoard ? BOARD_CHAIN_ID : review.agentChainId) as keyof typeof CHAINS];
  if (!network) return NextResponse.json({ error: 'The agent is registered on a chain Pokter does not read.' }, { status: 409 });

  try {
    const client = createPublicClient({ chain: network.chain, transport: fallback(network.rpc.map((url) => http(url))) });
    const [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash: hash as Hex }),
      client.getTransaction({ hash: hash as Hex }),
    ]);
    if (receipt.status !== 'success') return NextResponse.json({ error: 'The transaction did not succeed.' }, { status: 409 });
    const sent = { from: tx.from, to: tx.to, input: tx.input };
    const match = board ? matchesBoardReview(review, sent, board.address) : matchesFeedback(review, sent, siteUrl());
    if (!match.ok) return NextResponse.json({ error: match.reason }, { status: 409 });
    if (board) {
      store.setBoard(chainId, jobId, hash);
      /* The agent's rating as the board now holds it, rather than at the next hourly read. */
      const provider = reviewedProvider(receipt.logs, board.address);
      if (provider) await refreshBoardRatings({ wallets: [provider] }).catch(() => null);
      return NextResponse.json({ recorded: true, target: 'board', chainId: BOARD_CHAIN_ID, transactionHash: hash });
    }
    store.setOnchain(chainId, jobId, hash, review.agentChainId);
    return NextResponse.json({ recorded: true, chainId: review.agentChainId, transactionHash: hash });
  } catch (error) {
    return NextResponse.json({ error: `The transaction could not be read: ${logAndPublic('reviews/onchain', error)}` }, { status: 502 });
  }
}
