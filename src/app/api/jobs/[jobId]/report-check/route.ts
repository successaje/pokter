import { NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';

import { altanaNetworkFor } from '@/lib/altana/client';
import { logAndPublic } from '@/lib/api/public-error';
import { venusClient } from '@/lib/assay/venus';
import { readVenusFactsAt } from '@/lib/delivery/venus-facts';
import {
  CHECK_DOES_NOT_MEAN,
  CHECK_MEANS,
  cannotVerify,
  checkDeliveredVenusReport,
  venusHealthJob,
  venusSubjectFromBrief,
  type VenusReportVerification,
} from '@/lib/delivery/venus-report-check';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { storedDeliveryText } from '@/lib/erc8183/deliverable-gate';
import { deliverableKey, readDeliverable } from '@/lib/erc8183/deliverables';
import { findDeliverableUrl } from '@/lib/erc8183/deliverable-url';
import { fetchDeliverableText } from '@/lib/erc8183/fetch-deliverable';
import { historyClient } from '@/lib/erc8183/history-client';
import { decodePokterJobEnvelope, jobTaskFromDescription } from '@/lib/erc8183/job-envelope';
import { manifestMatch } from '@/lib/erc8183/manifest-match';
import { getJobStore } from '@/lib/erc8183/store';
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
    const network = altanaNetworkFor(chainId);
    const job = await getErc8183Job(network, BigInt(jobId));
    const brief = jobTaskFromDescription(job.description) ?? job.description;
    const category = decodePokterJobEnvelope(job.description)?.category ?? null;
    if (!venusHealthJob({ category, brief })) {
      return NextResponse.json({ applies: false, reason: 'This job did not ask for a Venus health factor, so there is nothing here this check can recompute.' });
    }
    if (!['SUBMITTED', 'COMPLETED', 'REJECTED'].includes(job.statusName)) {
      return answer(cannotVerify('Nothing has been delivered for this job yet, so there is no report to check.'));
    }

    const subject = venusSubjectFromBrief(brief);
    if (!subject.ok) {
      return answer(
        cannotVerify(
          subject.code === 'none'
            ? 'The brief this job was funded with names no wallet address, so there is no position for Pokter to read independently. The account has to come from what the buyer asked for — taking it from the report would let the report choose its own subject.'
            : `The brief names more than one address (${subject.candidates.join(', ')}), so which position the report should be about is not decided by the brief. Pokter will not pick one on the buyer’s behalf.`,
        ),
      );
    }

    /*
     * The same two-step the answer route uses: Pokter's own copy when it
     * has one, else the URL the agent committed on chain. Shared on
     * purpose — a check that read a different copy of the delivery from
     * the one the buyer is shown would be checking a different document.
     */
    /* The stored copy only when it is what was delivered; a draft never stands in for it. */
    let manifestText = storedDeliveryText(readDeliverable(deliverableKey(chainId, jobId)), job.deliverable);
    if (!manifestText) {
      const indexed = getJobStore().all().find((j) => j.chainId === chainId && j.jobId === jobId);
      const url =
        indexed?.deliverableUrl ??
        (await Promise.race([
          findDeliverableUrl(historyClient(chainId === 56 ? 56 : 97), correctedErc8183Addresses(chainId).policy, BigInt(jobId), job.submittedAt).catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000)),
        ]));
      if (!url) {
        return answer(cannotVerify('Pokter could not retrieve the delivered file: no link for it could be read just now. That is a gap in what Pokter can see, not a finding about the report.'));
      }
      manifestText = await fetchDeliverableText(url).catch(() => null);
      if (!manifestText) {
        return answer(cannotVerify('The delivered file could not be read from the link the agent published, so there is nothing to check.'));
      }
    }

    /*
     * Null, not false, when the job carries no hash to compare with. The
     * verifier refuses anything but `true`, and the distinction is what
     * lets it tell the buyer "this file is not what was committed" apart
     * from "Pokter could not confirm what was committed".
     */
    const committed = /^0x0{64}$/.test(job.deliverable) ? null : job.deliverable;
    const verification = await checkDeliveredVenusReport({
      subject: subject.subject,
      manifestText,
      manifestMatchesChain: committed === null ? null : manifestMatch(manifestText, committed) !== null,
      readFactsAt: (at) => readVenusFactsAt(venusClient(), at),
    });
    return answer(verification);
  } catch (error) {
    return NextResponse.json({ error: `The report could not be checked: ${logAndPublic('report-check', error)}` }, { status: 502 });
  }
}
