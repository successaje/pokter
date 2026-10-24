import { NextResponse } from 'next/server';

import { logAndPublic } from '@/lib/api/public-error';
import { venusClient, VENUS_COMPTROLLER } from '@/lib/assay/venus';
import { loadDeliveredVenusReport } from '@/lib/delivery/delivered-report';
import { readVenusFactsAt } from '@/lib/delivery/venus-facts';
import { checkDeliveredVenusReport } from '@/lib/delivery/venus-report-check';
import { manifestMatch } from '@/lib/erc8183/manifest-match';
import { jobChainParam } from '@/lib/jobs/href';
import { proofRun } from '@/lib/proofrun/run';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * The replayable receipt for one delivered job.
 *
 * The point of this endpoint is that somebody can stop trusting Pokter.
 * It hands over the criteria, the exact state the checks were run
 * against, what each check observed and the references needed to re-read
 * the chain — so the independent verifier can reach its own verdict
 * without asking this server anything.
 *
 * Recomputed per request rather than served from a store. A run is a
 * function of the job, the delivered bytes and chain state at a named
 * block, all of which are already immutable or already stored, so keeping
 * a fourth copy would only create something that could disagree with the
 * other three. It also means the artifact is the same object whether
 * Pokter produced it or the reader did.
 *
 * GET, and advisory like the check it wraps: nothing here settles a job,
 * releases escrow or records a score.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ chainId: string; jobId: string }> },
): Promise<NextResponse> {
  const rate = consumeRateLimit(`proofrun-artifact:${requestClientKey(request)}`, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const { chainId: rawChain, jobId } = await context.params;
  const chainId = jobChainParam(rawChain);
  if (!/^\d{1,18}$/.test(jobId) || chainId === null) {
    return NextResponse.json({ error: 'A numeric job id and its chain are required.' }, { status: 400 });
  }

  try {
    const loaded = await loadDeliveredVenusReport({ chainId, jobId });
    if (!loaded.ok) {
      /*
       * No artifact rather than an empty one. A receipt carrying no checks
       * would be indistinguishable, to anything consuming it, from a run
       * where nothing was wrong — and this endpoint's whole purpose is
       * that its output can be trusted to mean what it says.
       */
      return NextResponse.json(
        { error: loaded.refusal.reason, code: loaded.refusal.code, artifact: null },
        { status: loaded.refusal.code === 'not-this-check' ? 404 : 409 },
      );
    }

    const { report } = loaded;
    /*
     * The block hash is captured where the state is read, because that is
     * the only place it exists: `VenusReportVerification` carries the
     * block number but not the header, and the checker has no reason to.
     * Taken from the same reading the figures came from rather than a
     * second lookup, so the hash cannot belong to a different read than
     * the numbers it is supposed to pin.
     */
    let blockHash: string | null = null;
    const verification = await checkDeliveredVenusReport({
      subject: report.subject,
      manifestText: report.manifestText,
      manifestMatchesChain: report.committed === null ? null : manifestMatch(report.manifestText, report.committed) !== null,
      readFactsAt: async (at) => {
        const evidence = await readVenusFactsAt(venusClient(), at);
        if (evidence.available) blockHash = evidence.facts.blockHash;
        return evidence;
      },
    });

    const run = proofRun({
      job: { chainId, jobId },
      account: report.subject.account,
      deployment: VENUS_COMPTROLLER,
      /*
       * The chain the position lives on, pinned by the brief's subject, not
       * the escrow that funded the job. A testnet-funded job asks about a
       * mainnet Venus position; recording chain 97 beside the mainnet
       * Comptroller would send any replay to a chain with no Venus on it.
       */
      chainId: report.subject.chainId,
      verification,
      manifestText: report.manifestText,
      brief: report.brief,
      /*
       * Null when the node served no header. The independent verifier
       * treats a null or differing hash as not verified rather than
       * re-reading at the head, which is the difference between pinning
       * state and pinning a number.
       */
      blockHash,
      /* A real job for a real buyer. Fixtures say `fixture`, and nothing
         downstream has to infer which it was looking at. */
      provenance: 'customer',
    });

    return NextResponse.json(run.sealed, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `inline; filename="proofrun-${chainId}-${jobId}.json"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `The receipt could not be produced: ${logAndPublic('proofrun-artifact', error)}`, artifact: null },
      { status: 502 },
    );
  }
}
