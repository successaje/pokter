import { NextResponse } from 'next/server';

import { logAndPublic } from '@/lib/api/public-error';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { isRunnable } from '@/features/proofrun/catalogue';
import { forgetRun, runScenario, type RunRequest } from '@/features/proofrun/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 40;

/** The longest report a replay will read. Beyond this it is not a Venus report. */
const MAX_REPORT = 20_000;

/**
 * Run one ProofRun scenario.
 *
 * Public and unauthenticated, like the compatibility diagnostic it sits
 * beside: a buyer should be able to see where an agent fails without an
 * account, and nothing here moves money, writes on chain or contacts an
 * agent. A fixture makes no network call at all; a replay makes one
 * read-only archive read of BNB Chain.
 *
 * Rate limited per caller, because the replay path spends somebody else's
 * RPC allowance: one archive read, at the block the report names. Fixtures
 * are pure, and are served from this process's own memory after the first
 * run — which the response labels as reused rather than as fresh.
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

  const scenarioId = typeof body.scenarioId === 'string' ? body.scenarioId.trim() : '';
  if (!isRunnable(scenarioId)) {
    return NextResponse.json(
      {
        error:
          'That is not a scenario ProofRun can run from here. A live test is a funded job, reviewed and paid for in your own wallet.',
        field: 'scenario',
      },
      { status: 400 },
    );
  }

  const report = typeof body.report === 'string' ? body.report : '';
  if (report.length > MAX_REPORT) {
    return NextResponse.json(
      { error: `That report is longer than the ${MAX_REPORT.toLocaleString('en-US')} characters this check reads.`, field: 'report' },
      { status: 400 },
    );
  }

  const runRequest: RunRequest = {
    scenarioId,
    ...(typeof body.account === 'string' ? { account: body.account } : {}),
    ...(report ? { report } : {}),
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
