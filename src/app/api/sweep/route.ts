import { NextResponse } from 'next/server';

import { runSweep } from '@/lib/history/sweep';
import { checkForNewHires } from '@/lib/alerts/hires';
import { getErc8183DeliverableUrl, getErc8183Job } from '@altananetwork/sdk';
import { ALTANA_NETWORK } from '@/lib/altana/client';
import { notifyBuilderJobEvent, notifyJobEvent, subscribedJobs } from '@/lib/notifications/server';
import { getJobStore } from '@/lib/erc8183/store';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';

export const dynamic = 'force-dynamic';
/** A sweep probes the whole roster; it needs more than the default budget. */
export const maxDuration = 300;

/**
 * Scheduled sweep endpoint, for a platform cron (Vercel Cron, GitHub Actions, or
 * plain curl from a host crontab).
 *
 * Guarded by a shared secret: sweeps make outbound requests to third-party
 * agent endpoints, so an open trigger would let anyone use this deployment to
 * generate traffic against them.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.SWEEP_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: 'SWEEP_SECRET is not configured; refusing to run an unguarded sweep.' },
      { status: 503 },
    );
  }

  // Vercel Cron sends the secret as a bearer token.
  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const outcome = await runSweep();
    const notificationResults = await Promise.allSettled(
      subscribedJobs().map(async ({ chainId, jobId }) => {
        if (chainId !== ALTANA_NETWORK.chainId) return { attempted: 0, sent: 0 };
        const job = await getErc8183Job(ALTANA_NETWORK, BigInt(jobId));
        return notifyJobEvent({ chainId, jobId, status: job.statusName });
      }),
    );
    const notifications = notificationResults.reduce(
      (sum, result) => result.status === 'fulfilled' ? sum + result.value.sent : sum,
      0,
    );
    const notificationFailures = notificationResults.filter((result) => result.status === 'rejected').length;
    const builderResults = await Promise.allSettled(
      getJobStore().all().filter((job) => job.chainId === ALTANA_NETWORK.chainId).map(async (job) => {
        const onchain = await getErc8183Job(ALTANA_NETWORK, BigInt(job.jobId));
        const deliverableUrl = ['SUBMITTED', 'COMPLETED'].includes(onchain.statusName)
          ? await getErc8183DeliverableUrl(ALTANA_NETWORK, BigInt(job.jobId)).catch(() => undefined)
          : undefined;
        // The local row is only an index. Repair it from ERC-8183 during every
        // sweep so Activity and Builder never depend on somebody opening a
        // card to refresh a stale status.
        getJobStore().record({
          ...job,
          provider: onchain.provider,
          budgetRaw: onchain.budget.toString(),
          expiredAt: new Date(Number(onchain.expiredAt) * 1000).toISOString(),
          status: onchain.statusName,
          statusCheckedAt: new Date().toISOString(),
          deliverableUrl: deliverableUrl ?? job.deliverableUrl,
        });

        // Historical demo jobs predate ERC-8004 linkage and use a descriptive
        // slug instead of a token id. Their ERC-8183 state is still valid and
        // must be reconciled, but there is no registry owner to notify.
        if (!/^\d+$/.test(job.agentTokenId)) {
          return {
            attempted: 0, sent: 0, reconciled: true,
            notificationSkipped: true, notificationFailed: false,
          };
        }

        try {
          const agent = await getAgent((job.agentChainId ?? 56) as ChainId, job.agentTokenId);
          const email = await notifyBuilderJobEvent({
            owner: agent.owner_address, chainId: job.chainId, jobId: job.jobId,
            agentName: job.agentName, status: onchain.statusName, expiredAt: onchain.expiredAt,
          });
          return { ...email, reconciled: true, notificationSkipped: false, notificationFailed: false };
        } catch {
          // A temporary registry or mail-path failure must never roll back a
          // successful read of the canonical ERC-8183 job state.
          return {
            attempted: 0, sent: 0, reconciled: true,
            notificationSkipped: false, notificationFailed: true,
          };
        }
      }),
    );
    const builderEmails = builderResults.reduce(
      (sum, result) => result.status === 'fulfilled' ? sum + result.value.sent : sum,
      0,
    );
    /*
     * Hire watching rides the sweep because the sweep is already scheduled,
     * already secret-guarded, and already the thing that runs when nobody is
     * watching. A second cron would be a second thing to notice had stopped.
     *
     * Settled rather than awaited bare: a watcher failure must not fail the
     * sweep, which has already done the measuring by this point.
     */
    const hireWatch = await checkForNewHires().catch(() => null);

    return NextResponse.json({
      ...outcome, notifications, notificationFailures,
      hireWatch,
      builderNotifications: builderResults.filter((result) => result.status === 'fulfilled').length,
      builderEmails,
      reconciledJobs: builderResults.filter((result) => result.status === 'fulfilled' && result.value.reconciled).length,
      builderNotificationsSkipped: builderResults.filter(
        (result) => result.status === 'fulfilled' && result.value.notificationSkipped,
      ).length,
      builderNotificationFailures: builderResults.filter(
        (result) => result.status === 'fulfilled' && result.value.notificationFailed,
      ).length,
      jobReconciliationFailures: builderResults.filter((result) => result.status === 'rejected').length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Sweep failed: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
