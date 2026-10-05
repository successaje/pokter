import { NextResponse } from 'next/server';
import { isAddress, getAddress } from 'viem';

import { listAgents } from '@/lib/scan/client';
import type { ScanAgent } from '@/lib/scan/types';
import { classify, CATEGORY_BY_ID } from '@/lib/agents/categories';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

/**
 * The agents a wallet owns, read from the registry.
 *
 * Deliberately not behind ownership verification. Who owns an ERC-8004
 * identity is public and already on every agent page; proving control of
 * the wallet is what signing an action needs, not what reading a list
 * needs. Gating it meant a builder holding a passkey — which cannot
 * produce that proof at all — could not see their own agents, and a
 * marketplace that hides somebody's published work from them is answering
 * a question nobody asked.
 *
 * Rate limited because each call is two requests to an indexer that has
 * its own daily quota, and this one is reachable without a session.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`owned-agents:${requestClientKey(request)}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Wait a moment and try again.' },
      { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
    );
  }

  const address = new URL(request.url).searchParams.get('address') ?? '';
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'A wallet address is required.' }, { status: 400 });
  }
  const owner = getAddress(address);

  /*
   * Both chains, because an identity may be on either and a builder
   * thinking about one wallet is not thinking about two registries.
   */
  const pages = await Promise.all(
    ([56, 97] as const).map((chainId) =>
      listAgents({ chainId, ownerAddress: owner, limit: 100 }).catch(
        () => ({ items: [] as ScanAgent[] }),
      ),
    ),
  );

  const agents = pages.flatMap((page) => page.items).map((agent) => {
    const category = classify(agent);
    return {
      chainId: agent.chain_id,
      tokenId: agent.token_id,
      name: agent.name,
      imageUrl: agent.image_url ?? null,
      category: category === 'unclassified' ? null : CATEGORY_BY_ID.get(category)?.label ?? null,
      /* List rows carry the declared protocols; the endpoint itself only
         appears on the detail record, and fetching 100 of those to draw a
         dot is not worth the indexer's quota. */
      declaresProtocol: Boolean(agent.supported_protocols?.length),
      createdAt: agent.created_at ?? null,
    };
  });

  return NextResponse.json({ owner, agents, observedAt: new Date().toISOString() });
}
