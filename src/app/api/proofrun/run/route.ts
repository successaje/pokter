import { NextResponse } from 'next/server';

import { logAndPublic } from '@/lib/api/public-error';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { forgetRun, runScenario, type RunRequest } from '@/features/proofrun/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 40;

/**
 * Run one ProofRun scenario.
 *
 * Public and unauthenticated, like the compatibility diagnostic it sits
 * beside: a buyer should be able to see where an agent fails without an
 * account, and nothing here moves money, writes on chain or contacts an
 * agent.
 *
 * Every scenario this route can run is a fixture, and `runFixture`
 * supplies the facts rather than a reader, so no path from here reaches an
 * RPC. The rate limit is therefore not protecting somebody else's node —
 * it is protecting this process from an unauthenticated caller spending
 * its CPU on keccak hashing, which is the only cost a run has.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`proofrun:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many runs from here in the last minute. Wait a moment and try again.' },
      { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  /*
   * The id is checked by `runScenario` against the library's own
   * catalogue rather than against a list kept here. A second list would
   * be a second thing to keep in step, and the failure mode is a route
   * that refuses a scenario the page offers.
   */
  const runRequest: RunRequest = {
    scenarioId: typeof body.scenarioId === 'string' ? body.scenarioId.trim() : '',
  };

  /*
   * `fresh: true` forces a recompute and drops whatever this process was
   * holding, so the button that says "Run again" does run it again. Without
   * it the second press would return the held result labelled "reused",
   * which is honest and is not what the button offered.
   */
  if (body.fresh === true) forgetRun(runRequest);

  try {
    const outcome = await runScenario(runRequest);
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.message, field: outcome.field }, { status: 400 });
    }
    return NextResponse.json({ view: outcome.view }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    /*
     * A thrown run is a failure to run, and the response says so in those
     * terms. It must never reach the client as a result: the panel renders
     * any non-`view` response as "the run did not finish", which is the
     * only honest reading of an exception here.
     */
    return NextResponse.json(
      { error: logAndPublic('proofrun.run', error, 'The check could not be completed. Nothing was verified.') },
      { status: 502 },
    );
  }
}
