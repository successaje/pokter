import { NextResponse } from 'next/server';

import { acceptsProposals } from '@/lib/briefs/model';
import { proposalQuoteFresh } from '@/lib/briefs/proposal-price';
import { askProposalQuote } from '@/lib/briefs/proposal-quote';
import { getBriefStore } from '@/lib/briefs/store';
import { formatAmount } from '@/lib/network/tokens';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/*
 * The price an agent signs for one request, which is the price of its
 * proposal (`proposal-price.ts`). GET reads the newest one Pokter holds,
 * if it is still young enough to propose with; POST asks the agent again.
 * Either can be called by anyone: the price is the agent's own, signed, and
 * a proposal still needs its owner's signature.
 */

function agentOf(value: { agentChainId?: unknown; agentTokenId?: unknown }): { chainId: number; tokenId: string } | null {
  const chainId = Number(value.agentChainId);
  const tokenId = String(value.agentTokenId ?? '');
  return (chainId === 56 || chainId === 97) && /^\d{1,12}$/.test(tokenId) ? { chainId, tokenId: String(BigInt(tokenId)) } : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const brief = getBriefStore().get(id);
  if (!brief) return NextResponse.json({ error: 'No such request.' }, { status: 404 });
  const url = new URL(request.url);
  const agent = agentOf({ agentChainId: url.searchParams.get('agentChainId'), agentTokenId: url.searchParams.get('agentTokenId') });
  if (!agent) return NextResponse.json({ error: 'Invalid agent identifier.' }, { status: 400 });
  const quote = getBriefStore().proposalQuote(id, agent.chainId, agent.tokenId);
  const fresh = quote && proposalQuoteFresh(quote) ? quote : null;
  return NextResponse.json(
    { quote: fresh, label: fresh ? (formatAmount(brief.chainId, fresh.currency, fresh.priceRaw)?.label ?? null) : null },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  /* Each ask is a call to a third party's endpoint, so it is rationed like a hire quote. */
  const rate = consumeRateLimit(`proposal-quote:${requestClientKey(request)}`, { limit: 6, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many price requests just now. Try again shortly.' }, { status: 429 });

  const { id } = await params;
  const brief = getBriefStore().get(id);
  if (!brief) return NextResponse.json({ error: 'No such request.' }, { status: 404 });
  if (!acceptsProposals(brief)) return NextResponse.json({ error: 'This request is no longer taking proposals.' }, { status: 409 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }
  const agent = agentOf(body);
  if (!agent) return NextResponse.json({ error: 'Invalid agent identifier.' }, { status: 400 });

  const outcome = await askProposalQuote(brief, agent.chainId, agent.tokenId);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ quote: outcome.quote, label: outcome.label }, { headers: { 'cache-control': 'no-store' } });
}
