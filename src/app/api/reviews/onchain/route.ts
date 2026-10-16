import { NextResponse } from 'next/server';
import { createPublicClient, http, isHash, type Hex } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

import { matchesFeedback } from '@/lib/reviews/onchain';
import { getReviewStore } from '@/lib/reviews/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { siteUrl } from '@/lib/site';
import { logAndPublic } from '@/lib/api/public-error';

export const dynamic = 'force-dynamic';

const CHAINS = {
  56: { chain: bsc, rpc: 'https://bsc-rpc.publicnode.com' },
  97: { chain: bscTestnet, rpc: 'https://bsc-testnet-rpc.publicnode.com' },
} as const;

/**
 * Record that a review was published to the ERC-8004 Reputation Registry.
 *
 * The transaction is read from the agent's chain and must be the buyer's
 * own giveFeedback call for this review (see matchesFeedback). Nothing the
 * caller says beyond the job and the hash is trusted.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`review-onchain:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { chainId?: unknown; jobId?: unknown; transactionHash?: unknown };
  const chainId = Number(body.chainId);
  const jobId = String(body.jobId ?? '');
  const hash = String(body.transactionHash ?? '');
  if (!Number.isInteger(chainId) || !/^\d{1,18}$/.test(jobId) || !isHash(hash)) {
    return NextResponse.json({ error: 'A chain, job id and transaction hash are required.' }, { status: 400 });
  }

  const store = getReviewStore();
  const review = store.get(chainId, jobId);
  if (!review || review.visibility === 'hidden') return NextResponse.json({ error: 'No published review for this job.' }, { status: 404 });
  const network = CHAINS[review.agentChainId as keyof typeof CHAINS];
  if (!network) return NextResponse.json({ error: 'The agent is registered on a chain Pokter does not read.' }, { status: 409 });

  try {
    const client = createPublicClient({ chain: network.chain, transport: http(network.rpc) });
    const [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash: hash as Hex }),
      client.getTransaction({ hash: hash as Hex }),
    ]);
    if (receipt.status !== 'success') return NextResponse.json({ error: 'The transaction did not succeed.' }, { status: 409 });
    const match = matchesFeedback(review, { from: tx.from, to: tx.to, input: tx.input }, siteUrl());
    if (!match.ok) return NextResponse.json({ error: match.reason }, { status: 409 });
    store.setOnchain(chainId, jobId, hash, review.agentChainId);
    return NextResponse.json({ recorded: true, chainId: review.agentChainId, transactionHash: hash });
  } catch (error) {
    return NextResponse.json({ error: `The transaction could not be read: ${logAndPublic('reviews/onchain', error)}` }, { status: 502 });
  }
}
