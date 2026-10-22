import { NextRequest, NextResponse } from 'next/server';

import { authoriseAgentOwner } from '@/lib/builder/diagnostics/authorise';
import { collectBuilderDiagnostics } from '@/lib/builder/diagnostics/collect';
import { BUILDER_SESSION_COOKIE, builderSessionOwner } from '@/lib/builders/store';
import { registryOwner } from '@/lib/registry/onchain';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { logAndPublic } from '@/lib/api/public-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

/**
 * One agent's hire diagnostics, for the wallet that owns it.
 *
 * This is the agent's private side: which buyers stopped and on what, what
 * the agent said when it refused a funded job, how many it let lapse. A
 * rival builder reading it learns somebody else's conversion problems, so
 * the order below is the whole security of the endpoint and does not
 * change:
 *
 *  1. Rate limit, then the proved-ownership cookie.
 *  2. The owner the **registry** names now, read from the contract. Not the
 *     indexer: it can be minutes behind, and an agent sold this morning has
 *     to stop answering to its previous owner's session at once.
 *  3. `authoriseAgentOwner`, which refuses with 401, 503 or 403 and never
 *     confuses "the registry did not answer" with "not yours".
 *  4. Only then is anything read, and only through the proof that call
 *     returns — `buildBuilderDiagnostics` throws without it, so a later
 *     edit cannot reach the data by a route that skipped step 3.
 *
 * Nothing is read or assembled before the decision, so a refusal cannot
 * leak by timing a response against a populated agent either.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const rate = consumeRateLimit(`builder-diagnostics:${requestClientKey(request)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many diagnostics requests just now. Try again shortly.' },
      { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
    );
  }

  const params = new URL(request.url).searchParams;
  const chainId = Number(params.get('chainId'));
  const tokenId = params.get('tokenId') ?? '';
  if ((chainId !== 56 && chainId !== 97) || !/^\d{1,12}$/.test(tokenId)) {
    return NextResponse.json({ error: 'Give the network and the agent’s registry number.' }, { status: 400 });
  }

  const session = builderSessionOwner(request.cookies.get(BUILDER_SESSION_COOKIE)?.value);
  const owner = session ? await registryOwner(chainId, tokenId).catch(() => null) : null;
  const decision = authoriseAgentOwner({ sessionOwner: session, registryOwner: owner, chainId, tokenId });
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.message, reason: decision.reason },
      { status: decision.status, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  try {
    const diagnostics = await collectBuilderDiagnostics(decision.proof);
    return NextResponse.json(diagnostics, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: `Diagnostics could not be assembled: ${logAndPublic('builders/diagnostics', error)}` },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
