import { NextResponse } from 'next/server';

import { dossierLadder } from '@/lib/agents/dossier-ladder';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import { canonicalTokenId } from '@/lib/builder/diagnostics/attempt';
import { priceAskCounts, recordPriceAsk } from '@/lib/builder/diagnostics/store';
import { currentHireBlockerWithCard } from '@/lib/hire/blocker-live';
import { getDossier } from '@/lib/marketplace';
import { escrowOptionsForHire } from '@/lib/network/escrow';
import type { ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/*
 * Asking an agent that cannot be priced for its price.
 *
 * An agent that signs no price cannot be hired through escrow, and its page
 * says why to whoever looks, which is rarely its owner. A buyer who wanted
 * it can say so here: the ask is counted, anonymously, and the owner is
 * told in Building and in their notifications, with the fix. It changes
 * nothing about the hire, which still needs the agent's signed price.
 *
 * POST asks; GET reads the counts for a list of agents (an owner's), which
 * are aggregates and say nothing about who asked.
 */

function agentOf(chainId: unknown, tokenId: unknown): { chainId: ChainId; tokenId: string } | null {
  const chain = Number(chainId);
  const token = canonicalTokenId(String(tokenId ?? ''));
  return (chain === 56 || chain === 97) && token !== null ? { chainId: chain as ChainId, tokenId: token } : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`price-ask:${requestClientKey(request)}`, { limit: 6, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many asks just now. Try again shortly.' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }
  const agent = agentOf(body.chainId, body.tokenId);
  if (!agent) return NextResponse.json({ error: 'Invalid agent identifier.' }, { status: 400 });

  let dossier: Awaited<ReturnType<typeof getDossier>>;
  try {
    dossier = await getDossier(agent.chainId, agent.tokenId);
  } catch {
    return NextResponse.json({ error: 'No such agent.' }, { status: 404 });
  }
  /* The same reading the agent page and the public API make: only an agent that cannot be priced, for a reason that is not passing, is asked for. */
  const escrowChain = escrowOptionsForHire(dossier.quote?.currency)[0] ?? ALTANA_NETWORK.chainId;
  const { payable } = dossierLadder(dossier, escrowChain);
  const blocker = await currentHireBlockerWithCard(dossier.agent, dossier.quote, payable, dossier.agent.services?.a2a?.endpoint);
  if (!blocker) return NextResponse.json({ error: 'This agent signs a price already, so it can be hired directly.' }, { status: 409 });
  if (blocker.transient) return NextResponse.json({ error: 'Pokter could not check this agent just now. Try again later.' }, { status: 409 });

  const recorded = recordPriceAsk({ request, chainId: agent.chainId, tokenId: agent.tokenId });
  const [count] = priceAskCounts([agent]);
  return NextResponse.json({ recorded, asks: count?.asks ?? (recorded ? 1 : 0) }, { headers: { 'cache-control': 'no-store' } });
}

export async function GET(request: Request): Promise<NextResponse> {
  const listed = new URL(request.url).searchParams.get('agents') ?? '';
  const agents = listed
    .split(',')
    .slice(0, 50)
    .map((key) => {
      const [chainId, tokenId] = key.split(':');
      return agentOf(chainId, tokenId);
    })
    .filter((agent): agent is { chainId: ChainId; tokenId: string } => agent !== null);
  if (agents.length === 0) return NextResponse.json({ error: 'List agents as chainId:tokenId, comma-separated.' }, { status: 400 });
  return NextResponse.json({ counts: priceAskCounts(agents) }, { headers: { 'cache-control': 'no-store' } });
}
