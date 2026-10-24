import { NextResponse } from 'next/server';

import { logAndPublic } from '@/lib/api/public-error';
import { venusClient } from '@/lib/assay/venus';
import { loadDeliveredVenusReport } from '@/lib/delivery/delivered-report';
import { readVenusFactsAt } from '@/lib/delivery/venus-facts';
import {
  CHECK_DOES_NOT_MEAN,
  CHECK_MEANS,
  cannotVerify,
  checkDeliveredVenusReport,
  type VenusReportVerification,
} from '@/lib/delivery/venus-report-check';
import { manifestMatch } from '@/lib/erc8183/manifest-match';
import { jobChainParam } from '@/lib/jobs/href';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Check a delivered Venus health-factor report against the chain.
 *
 * Advisory, and GET for that reason. It reads the job, the delivery and
 * Venus, and returns a verdict; it settles nothing, releases nothing,
 * refunds nothing, records no score and takes no bond. The buyer reads it
 * and decides, and `CHECK_DOES_NOT_MEAN` travels with every answer so the
 * interface cannot quietly drop the part that says what a match is not.
 *
 * Everything the verdict rests on comes from somewhere the agent cannot
 * move: the account from the brief in the job description on chain, the
 * block from the report but checked against the head, the figures from
 * Venus's own contracts at that block, and the delivery itself only once
 * its bytes hash to what the agent committed.
 */
export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }): Promise<NextResponse> {
  const rate = consumeRateLimit(`report-check:${requestClientKey(request)}`, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  const { jobId } = await context.params;
  const chainId = jobChainParam(new URL(request.url).searchParams.get('chain') ?? undefined);
  if (!/^\d{1,18}$/.test(jobId) || chainId === null) {
    return NextResponse.json({ error: 'A numeric job id and its chain are required.' }, { status: 400 });
  }

  const answer = (verification: VenusReportVerification) =>
    NextResponse.json({ applies: true, means: CHECK_MEANS, doesNotMean: CHECK_DOES_NOT_MEAN, verification });

  try {
    const loaded = await loadDeliveredVenusReport({ chainId, jobId });
    if (!loaded.ok) {
      /*
       * `not-this-check` is the one refusal that is not a failure to see:
       * the job never asked for this, so there is no verdict to withhold.
       * Everything else is Pokter saying what it could not read.
       */
      if (loaded.refusal.code === 'not-this-check') {
        return NextResponse.json({ applies: false, reason: loaded.refusal.reason });
      }
      return answer(cannotVerify(loaded.refusal.reason));
    }
    const { report } = loaded;
    const verification = await checkDeliveredVenusReport({
      subject: report.subject,
      manifestText: report.manifestText,
      manifestMatchesChain: report.committed === null ? null : manifestMatch(report.manifestText, report.committed) !== null,
      readFactsAt: (at) => readVenusFactsAt(venusClient(), at),
    });
    return answer(verification);
  } catch (error) {
    return NextResponse.json({ error: `The report could not be checked: ${logAndPublic('report-check', error)}` }, { status: 502 });
  }
}
