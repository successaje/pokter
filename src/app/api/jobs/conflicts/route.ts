import { NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';

import { altanaNetworkFor } from '@/lib/altana/client';
import { adjudicateJobConflicts } from '@/lib/erc8183/job-conflicts';
import { conflictDatabase } from '@/lib/erc8183/store';
import { logAndPublic } from '@/lib/api/public-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Settle the duplicate job rows the store set aside, against the chain.
 *
 * The migration keeps one row per job and quarantines the rest, but it
 * runs at boot with no network and cannot tell which copy was right. This
 * can, and it has to run where the data is: the rows that matter are in
 * the deployment's own index, and a script on a laptop adjudicates a
 * database nobody is publishing.
 *
 * Re-indexing through `/api/jobs/index` would have been the lazy repair
 * and the wrong one: it rebuilds the row from chain, which fixes the agent
 * and destroys the hire time, the deliverable link and the settle hash.
 *
 * Operator-only, and a dry run unless asked. GET reports what it would do.
 */
function denied(request: Request): NextResponse | null {
  const secret = process.env.SWEEP_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }
  return null;
}

const readJob = async (chainId: number, jobId: string) => {
  const job = await getErc8183Job(altanaNetworkFor(chainId), BigInt(jobId));
  return { provider: job.provider as string, description: job.description ?? null };
};

export async function GET(request: Request): Promise<NextResponse> {
  const refused = denied(request);
  if (refused) return refused;
  try {
    const outcomes = await adjudicateJobConflicts(conflictDatabase(), readJob, { apply: false });
    return NextResponse.json({ applied: false, conflicts: outcomes.length, outcomes });
  } catch (error) {
    return NextResponse.json({ error: logAndPublic('jobs/conflicts', error) }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const refused = denied(request);
  if (refused) return refused;
  const body = (await request.json().catch(() => ({}))) as { apply?: unknown };
  /*
   * Writing is asked for explicitly. A POST that corrected rows by default
   * would make "let me see what this would do" the dangerous call.
   */
  const apply = body.apply === true;
  try {
    const outcomes = await adjudicateJobConflicts(conflictDatabase(), readJob, { apply });
    return NextResponse.json({ applied: apply, conflicts: outcomes.length, outcomes });
  } catch (error) {
    return NextResponse.json({ error: logAndPublic('jobs/conflicts', error) }, { status: 502 });
  }
}
