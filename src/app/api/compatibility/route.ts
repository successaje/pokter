import { NextResponse } from 'next/server';

import { AgentNotFound, diagnose } from '@/lib/diagnostic/checks';
import { getProbeStore } from '@/lib/history/store';
import type { ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 40;

/**
 * Run the marketplace's own checks against one agent and report what they saw.
 *
 * Public and unauthenticated on purpose: an operator should be able to ask why
 * their agent looks the way it does without an account, and every call this
 * makes is read-only — a liveness probe and a negotiation that moves no funds
 * and writes nothing on chain.
 *
 * Rate limited more tightly than the trial, because each run costs several
 * outbound requests against somebody else's endpoint.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`compatibility:${requestClientKey(request)}`, {
    limit: 4,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Diagnostic limit reached. Wait a moment before trying again.' },
      { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const chainId = Number(body.chainId ?? 56) as ChainId;
  const tokenId = String(body.tokenId ?? '').trim();
  if (chainId !== 56 && chainId !== 97) {
    return NextResponse.json(
      { error: 'Supported chains are 56 (BNB Chain) and 97 (BNB Testnet).' },
      { status: 400 },
    );
  }
  if (!/^\d+$/.test(tokenId)) {
    return NextResponse.json(
      { error: 'Token id must be the number from the ERC-8004 registry.' },
      { status: 400 },
    );
  }

  try {
    const report = await diagnose(chainId, tokenId);

    /*
     * A passing diagnostic puts the agent on the sweep roster.
     *
     * This is the whole point of the page. An operator could previously prove
     * they met every published standard and still not be measured, because
     * discovery is keyword-driven and the registry tier is ordered by a score
     * a new agent does not have yet. They met the bar and nothing happened.
     *
     * Enrolment records only that we should call them from now on. It writes
     * no probe and no result, so running this repeatedly cannot manufacture a
     * track record — the evidence still comes entirely from sweeps Pokter
     * schedules. The gate is an endpoint we could actually reach: an agent
     * that publishes no service record has nothing for a sweep to call.
     */
    const enrolled = report.checks.some(
      (check) => check.id === 'endpoint' && check.status === 'pass',
    );
    if (enrolled) {
      try {
        getProbeStore().enroll([{ chainId, tokenId }]);
      } catch {
        /*
         * Never fail the diagnostic over this. The report is what the operator
         * asked for; enrolment is something we do off the back of it, and a
         * store that will not write is our problem to notice, not theirs.
         */
      }
    }

    return NextResponse.json({ ...report, enrolled });
  } catch (error) {
    if (error instanceof AgentNotFound) {
      return NextResponse.json(
        {
          error: `No ERC-8004 agent with token id ${tokenId} on chain ${chainId}.`,
        },
        { status: 404 },
      );
    }
    /*
     * A failure here is Pokter's, not the agent's, and saying so matters: an
     * operator told "your agent failed" when our registry lookup timed out
     * would go and change something that was never wrong.
     */
    return NextResponse.json(
      { error: `Pokter could not complete the diagnostic: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
