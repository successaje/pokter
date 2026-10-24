import { NextResponse } from 'next/server';

import { builderFirstSessions } from '@/lib/builders/store';
import { getBriefStore } from '@/lib/briefs/store';
import { getJobStore } from '@/lib/erc8183/store';
import { emailSignupCounts } from '@/lib/notifications/server';
import { buildSignupReport } from '@/lib/ops/signups';
import { getProfileStore } from '@/lib/profiles/store';
import { teamWalletSet } from '@/lib/team/server';

export const dynamic = 'force-dynamic';

/**
 * How many people have started using Pokter, by what they did. Counts
 * only, for the operator: behind the sweep's secret, never linked, never
 * cached. See `lib/ops/signups.ts` for what each figure counts.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.SWEEP_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }
  const now = Date.now();
  const read = <T,>(label: string, fn: () => T, empty: T): T => {
    try {
      return fn();
    } catch (error) {
      console.error(`[operator-signups] ${label} unreadable`, (error as Error).message);
      return empty;
    }
  };
  const report = buildSignupReport({
    profiles: read('profiles', () => getProfileStore().signers(), []),
    buildingSignIns: read('builders', () => builderFirstSessions(), []),
    posters: read('posters', () => getBriefStore().posters(), []),
    bidders: read('bidders', () => getBriefStore().bidders(), []),
    buyers: read('buyers', () => getJobStore().all().map((job) => ({ wallet: job.client, firstAt: job.hiredAt })), []),
    emails: read('emails', () => emailSignupCounts(now), null),
    team: teamWalletSet(),
    now,
  });
  return NextResponse.json(report, { headers: { 'cache-control': 'no-store' } });
}
