import { NextResponse } from 'next/server';
import { getAddress, isAddress, isHex, type Address, type Hex } from 'viem';

import { acceptsProposals, bidMessage, readBidContent, type Bid } from '@/lib/briefs/model';
import { getBriefStore } from '@/lib/briefs/store';
import { registryOwner } from '@/lib/registry/onchain';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { signedByWallet, walletCanBeChecked } from '@/lib/wallet/signed-by';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return NextResponse.json({ bids: getBriefStore().bidsFor(id) });
}

/**
 * Bid on a brief.
 *
 * Two wallets may sign, and both are checked against the registry rather
 * than taken on trust: the agent's own registered wallet, or the owner the
 * ERC-8004 registry names for that token. The first is what an agent
 * bidding for itself can produce; the second is what a builder at a
 * keyboard can. Anyone else offering somebody else's agent is refused,
 * which is the only claim this endpoint has to make.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const rate = consumeRateLimit(`bid:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many bids just now. Try again shortly.' }, { status: 429 });

  const { id } = await params;
  const brief = getBriefStore().get(id);
  if (!brief) return NextResponse.json({ error: 'No such brief.' }, { status: 404 });
  if (!acceptsProposals(brief)) return NextResponse.json({ error: 'This request is no longer taking proposals.' }, { status: 409 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const bidder = String(body.bidder ?? '');
  const signature = String(body.signature ?? '');
  const placedAt = String(body.placedAt ?? '');
  const content = readBidContent(body.content);
  if (!isAddress(bidder) || !isHex(signature) || !content || Number.isNaN(Date.parse(placedAt))) {
    return NextResponse.json({ error: 'The bid payload is invalid.' }, { status: 400 });
  }

  const owner = await registryOwner(content.agentChainId, content.agentTokenId);
  if (!owner) {
    return NextResponse.json(
      { error: 'The registry did not answer for that agent, so Pokter cannot confirm who may bid for it.' },
      { status: 503 },
    );
  }
  /* The agent's own wallet is not read from the registry here: the owner is
     the claim the registry actually makes, and an agent bidding for itself
     signs from the wallet its listing already names. Both are compared
     checksummed, since one side comes from a user and one from a contract. */
  const entitled = getAddress(bidder) === getAddress(owner);
  if (!entitled) {
    return NextResponse.json(
      { error: 'Only the wallet the registry names as this agent’s owner can bid for it.' },
      { status: 403 },
    );
  }

  if (!(await walletCanBeChecked(content.agentChainId, bidder as Address, signature as Hex))) {
    return NextResponse.json(
      { error: 'This wallet has no code on chain yet, so its signature cannot be checked.' },
      { status: 409 },
    );
  }

  const message = bidMessage({ ...content, briefId: id, bidder, placedAt });
  if (!(await signedByWallet(content.agentChainId, bidder as Address, message, signature as Hex))) {
    return NextResponse.json({ error: 'That signature does not match this bid.' }, { status: 403 });
  }

  const bid: Bid = {
    ...content,
    id: crypto.randomUUID(),
    briefId: id,
    bidder: bidder as Address,
    signature: signature as Hex,
    placedAt,
  };
  getBriefStore().placeBid(bid);
  return NextResponse.json({ bid }, { status: 201 });
}
