import { NextResponse } from 'next/server';

import { prepareQuoteSignature } from '@/lib/erc8183/quote-signing';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * The typed data that lets a seller quote from a wallet which signs no plain
 * message, as a Binance Agentic Wallet does not.
 *
 * Read-only and stateless: it returns the struct to sign and the two commands
 * that sign it, and keeps nothing. Pokter never holds the key and never sees
 * the signature until the quote itself comes back through the agent's own
 * endpoint, where it is checked against the registry like any other.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`seller-quote-prepare:${requestClientKey(request)}`, { limit: 60, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: 'Expected a JSON body: { agentWallet, chainId, negotiationHash } or { agentWallet, chainId, content }.' }, { status: 400 });
  }

  const prepared = prepareQuoteSignature({
    negotiationHash: body.negotiationHash,
    content: body.content,
    chainId: body.chainId,
    agentWallet: body.agentWallet,
  });
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: prepared.status });

  const { negotiationHash, chainId, agentWallet, typedData, preview, execute, then } = prepared;
  return NextResponse.json({ negotiationHash, chainId, agentWallet, typedData, preview, execute, then });
}
