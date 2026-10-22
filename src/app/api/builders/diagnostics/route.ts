import { NextRequest, NextResponse } from 'next/server';

import { canonicalTokenId } from '@/lib/builder/diagnostics/attempt';
import { authoriseAgentOwner } from '@/lib/builder/diagnostics/authorise';
import { collectBuilderDiagnostics } from '@/lib/builder/diagnostics/collect';
import { BUILDER_SESSION_COOKIE, builderSessionOwner } from '@/lib/builders/store';
import { registryOwnerRead } from '@/lib/registry/onchain';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { logAndPublic } from '@/lib/api/public-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

/* On every answer, refusals included. Whether an agent is being asked about
   at all, and how often, is as much the owner's business as the figures
   are; the 200 was already marked private and the 400 and 429 were not. */
const PRIVATE = { 'Cache-Control': 'private, no-store' } as const;

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
      { status: 429, headers: { ...PRIVATE, 'retry-after': String(rate.retryAfterSeconds) } },
    );
  }

  const params = new URL(request.url).searchParams;
  const chainId = Number(params.get('chainId'));
  /*
   * Canonical, and to the width of a uint256 rather than the twelve digits
   * the other builder routes happen to cap at. Both halves of that were
   * losing rows: `/api/hire/quote` accepts any run of digits, so a buyer
   * arriving at `tokenId=045422` recorded attempts under a key this panel
   * never asked for, and a 13-digit id could be recorded and then refused
   * by the reader.
   */
  const tokenId = canonicalTokenId(params.get('tokenId'));
  if ((chainId !== 56 && chainId !== 97) || tokenId === null) {
    return NextResponse.json(
      { error: 'Give the network and the agent’s registry number.' },
      { status: 400, headers: PRIVATE },
    );
  }

  const session = builderSessionOwner(request.cookies.get(BUILDER_SESSION_COOKIE)?.value);
  /*
   * One read, which says whether the chain answered when it found nothing.
   *
   * A builder who mistyped a registry number was told the lookup had failed
   * and to try again shortly, which is advice to retry forever — so the two
   * empties have to be told apart. They are told apart by the read itself:
   * `ownerOf` on an unminted id reverts, and a revert is the node saying it
   * ran the call. Asking a second, cheaper question instead does not work,
   * because the method that fails is `eth_call`, and an endpoint whose
   * eth_call is rate limited or pruned still answers `eth_blockNumber` from
   * cache — which reports a reachable chain and a missing agent, and tells
   * the owner of a real agent that it does not exist.
   *
   * Anything that is not a clean answer leaves it unproven, and unproven
   * keeps the 503 that grants nothing.
   */
  const read = session
    ? await registryOwnerRead(chainId, tokenId).catch(() => ({ owner: null, answered: false }))
    : { owner: null, answered: false };
  const decision = authoriseAgentOwner({
    sessionOwner: session,
    registryOwner: read.owner,
    registryReachable: read.answered,
    chainId,
    tokenId,
  });
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.message, reason: decision.reason },
      { status: decision.status, headers: PRIVATE },
    );
  }

  try {
    const diagnostics = await collectBuilderDiagnostics(decision.proof);
    return NextResponse.json(diagnostics, { headers: PRIVATE });
  } catch (error) {
    return NextResponse.json(
      { error: `Diagnostics could not be assembled: ${logAndPublic('builders/diagnostics', error)}` },
      { status: 502, headers: PRIVATE },
    );
  }
}
