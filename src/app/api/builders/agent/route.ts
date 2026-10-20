import { NextResponse } from 'next/server';

import { classify, CATEGORY_BY_ID } from '@/lib/agents/categories';
import { resolveAgentImage } from '@/lib/registry/image';
import { registryOwner } from '@/lib/registry/onchain';
import { getAgent } from '@/lib/scan/client';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

/**
 * One agent by its ERC-8004 id, with the owner the registry names now.
 *
 * For a builder adding an agent to a proposal by hand: they see which
 * agent the id is before writing anything, and whether the wallet they
 * have connected is the one allowed to send it. The owner is read from
 * the registry contract, not the indexer, because it is the same read the
 * proposal endpoint makes when it decides — this only tells them sooner.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`agent-lookup:${requestClientKey(request)}`, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many lookups just now. Try again shortly.' }, { status: 429 });

  const params = new URL(request.url).searchParams;
  const chainId = Number(params.get('chainId'));
  const tokenId = params.get('tokenId') ?? '';
  if ((chainId !== 56 && chainId !== 97) || !/^\d{1,12}$/.test(tokenId)) {
    return NextResponse.json({ error: 'Give the network and the agent’s registry number.' }, { status: 400 });
  }

  const owner = await registryOwner(chainId, tokenId).catch(() => null);
  if (!owner) {
    return NextResponse.json(
      { error: `The registry has no agent #${tokenId} on ${chainId === 56 ? 'BNB Chain' : 'BNB Testnet'}, or did not answer.` },
      { status: 404 },
    );
  }

  /* The name and picture are the indexer's; an agent it has not indexed yet is still a real identity. */
  const detail = await getAgent(chainId, tokenId).catch(() => null);
  const imageUrl = await resolveAgentImage(chainId, tokenId, detail?.image_url).catch(() => null);
  const category = detail ? classify(detail) : 'unclassified';
  return NextResponse.json({
    chainId,
    tokenId,
    name: detail?.name ?? `Agent #${tokenId}`,
    imageUrl,
    category: category === 'unclassified' ? null : (CATEGORY_BY_ID.get(category)?.label ?? null),
    owner,
  });
}
