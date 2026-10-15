import { NextResponse } from 'next/server';

import { runSweep } from '@/lib/history/sweep';
import { BSC_TESTNET } from '@/lib/scan/types';
import { checkForNewHires } from '@/lib/alerts/hires';
import { alertChannels, sendOperatorAlert } from '@/lib/alerts/operator';
import { retryStuckDeliveries } from '@/lib/erc8183/delivery-retry';
import { noticeUnansweredJobs } from '@/lib/erc8183/notice-sweep';
import { checkAnsweredTasks } from '@/lib/agent/answered-tasks-sweep';
import { alertStuckJobs } from '@/lib/erc8183/stuck-alert';
import { getErc8183DeliverableUrl, getErc8183Job } from '@altananetwork/sdk';
import { altanaNetworkFor } from '@/lib/altana/client';
import { followedAgents, notifyBuilderJobEvent, notifyFollowers, notifyJobEvent, subscribedJobs } from '@/lib/notifications/server';
import type { FollowedAgentState } from '@/lib/notifications/agent-changes';
import { getJobStore } from '@/lib/erc8183/store';
import { getAgent } from '@/lib/scan/client';
import { refreshFunders } from '@/lib/funding/store';
import { runDueHealthFactorChecks } from '@/lib/assay/run';
import { runDueStaticCategoryChecks } from '@/lib/assay/static-run';
import { gradeDuePaidChecks } from '@/lib/assay/paid-run';
import { reconcileJobIndex } from '@/lib/erc8183/reconcile';
import { publishSeal } from '@/lib/seals/run';
import { indexEscrowJobs, refreshAgentWallets } from '@/lib/quest/indexer';
import { listMarketplaceWithStatus, listSearchableWithStatus } from '@/lib/marketplace';
import type { ChainId } from '@/lib/scan/types';
import { getProbeStore } from '@/lib/history/store';
import { sweepRecent } from '@/lib/history/schedule';

export const dynamic = 'force-dynamic';
/** A sweep probes the whole roster; it needs more than the default budget. */
export const maxDuration = 300;

/** Held while a sweep runs in this process (there is one machine). */
let sweepRunning = false;

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

  /*
   * Prove the alert path works without waiting for the event it watches for.
   *
   * There was no way to tell a configured channel from a dead one except by
   * having somebody outside the team hire an agent and seeing whether a
   * message arrived. That is a poor test: it is rare, it cannot be repeated,
   * and the first time it ran, it failed silently.
   *
   * Behind the same secret as the sweep, because it sends a real message.
   * It runs no sweep, writes no cursor and touches no store, so it is safe
   * to call against production as often as needed.
   */
  if (new URL(request.url).searchParams.get('test') === 'alert') {
    const configured = alertChannels();
    const delivery = await sendOperatorAlert({
      subject: 'Pokter: alert channel test',
      body:
        'This is a test of the operator alert channel, triggered deliberately.\n\n' +
        'If you are reading it, a real hire from outside the team would reach ' +
        'you the same way. No sweep ran and nothing was recorded.',
    });
    return NextResponse.json({
      test: 'alert',
      configured,
      delivery,
      reached: delivery.telegram === 'sent' || delivery.email === 'sent',
    });
  }

  /*
   * One sweep at a time, and none straight after another. The server now
   * schedules its own sweeps (src/lib/history/scheduler.ts) and GitHub's
   * cron remains as a backup, so two triggers can arrive together; a second
   * sweep would double the calls to every third-party endpoint for no new
   * evidence. `?force=1` runs one regardless of the last, never alongside one.
   */
  if (sweepRunning) {
    return NextResponse.json({ skipped: 'running', note: 'A sweep is already running.' }, { status: 409 });
  }
  const last = getProbeStore().lastSweep();
  if (new URL(request.url).searchParams.get('force') !== '1' && sweepRecent(last?.finishedAt ?? null, Date.now())) {
    return NextResponse.json({ skipped: 'recent', lastFinishedAt: last?.finishedAt ?? null });
  }

  sweepRunning = true;
  try {
    const outcome = await runSweep();

    /*
     * Testnet, measured in parallel with mainnet and listed from neither.
     *
     * Every agent in the catalogue is registered on mainnet while escrow
     * settles on testnet, so none of them can see a job exists and Pokter's
     * own seller performs all of them. Agents registered on the escrow
     * chain could deliver for themselves — but a marketplace cannot switch
     * to them on the day it decides to, because the product is the track
     * record and theirs would be empty.
     *
     * So the record starts accruing now, before any decision. Nothing is
     * listed from it and no public figure counts it: `stats()` is scoped to
     * one chain for exactly this reason.
     *
     * Shallower than the mainnet pass, deliberately. Testnet agents are far
     * more likely to publish a reachable endpoint — 43 in a sample of 100
     * against 7 on mainnet — so the same roster size costs several times
     * the outbound calls and the whole sweep shares one 300s budget.
     *
     * Wrapped so it cannot fail the run. A measurement already taken must
     * not be lost to an experiment running after it.
     */
    const testnetSweep = await runSweep({
      chainId: BSC_TESTNET,
      perCategory: 6,
      registryDepth: 50,
    }).catch(() => null);
    const notificationResults = await Promise.allSettled(
      subscribedJobs().map(async ({ chainId, jobId }) => {
        // Every escrow Pokter has funded hires on, not only the default.
        if (chainId !== 56 && chainId !== 97) return { attempted: 0, sent: 0 };
        const job = await getErc8183Job(altanaNetworkFor(chainId), BigInt(jobId));
        return notifyJobEvent({ chainId, jobId, status: job.statusName, agentName: getJobStore().byId(`${chainId}:${jobId}`)?.agentName });
      }),
    );
    const notifications = notificationResults.reduce(
      (sum, result) => result.status === 'fulfilled' ? sum + result.value.sent : sum,
      0,
    );
    const notificationFailures = notificationResults.filter((result) => result.status === 'rejected').length;
    const builderResults = await Promise.allSettled(
      getJobStore().all().filter((job) => job.chainId === 56 || job.chainId === 97).map(async (job) => {
        const network = altanaNetworkFor(job.chainId);
        const onchain = await getErc8183Job(network, BigInt(job.jobId));
        const deliverableUrl = ['SUBMITTED', 'COMPLETED'].includes(onchain.statusName)
          ? await getErc8183DeliverableUrl(network, BigInt(job.jobId)).catch(() => undefined)
          : undefined;
        // The local row is only an index. Repair it from ERC-8183 during every
        // sweep so Activity and Builder never depend on somebody opening a
        // card to refresh a stale status.
        getJobStore().record({
          ...job,
          client: onchain.client,
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

    /*
     * Deliver anything whose notification never arrived. Runs after the
     * reconciliation above, so the statuses it reads are the ones this sweep
     * just refreshed, and caught like the watcher because a retry failing
     * must not cost us the measurement the sweep already did.
     */
    const deliveryRetries = await retryStuckDeliveries().catch(() => null);

    /*
     * Outside sellers, on every escrow chain: tell any that were never told
     * their job is funded (a buyer who closed the tab first), and keep what
     * they answer. The retry above only ever covered Pokter's own seller.
     */
    const sellerNotices = await noticeUnansweredJobs().catch(() => null);

    /*
     * After the retry, not instead of it. What matters is the jobs still
     * unmoved once the automatic attempt has had its go — the retry trying
     * and failing used to look identical to the retry succeeding, because
     * neither said anything.
     */
    const stuckJobs = await alertStuckJobs().catch(() => null);

    /*
     * Who first funded each mainnet owner wallet, so agents run from
     * several wallets count as one operator in "Most reliable". Bounded per
     * run and off without NODEREAL_API_KEY; last, because nothing above
     * depends on it and a slow lookup must not cost the measurements.
     */
    const listings = await listMarketplaceWithStatus({ limit: 400 })
      .then(({ sections }) => sections.flatMap(({ listings: l }) => l))
      .catch(() => null);
    const funders = listings
      ? await refreshFunders(listings.filter((l) => l.agent.chain_id === 56).map((l) => l.agent.owner_address)).catch(() => null)
      : null;

    /*
     * Health factor checks: a few listed health-factor agents per run, each
     * asked about real Venus positions and compared with Pokter's own
     * reading. Last and caught, like the funders, so a slow agent cannot
     * cost the measurements above.
     */
    const healthFactorChecks = listings
      ? await runDueHealthFactorChecks(
          listings.filter((l) => l.category === 'health-factor').map((l) => ({ chainId: l.agent.chain_id, tokenId: l.agent.token_id })),
        ).catch(() => null)
      : null;

    /*
     * Deterministic category checks for the other four categories. These
     * use published fixed scenarios, not live market data, and their UI says
     * so. Two agents at most per sweep bounds this work, and failure is
     * isolated so it cannot erase the availability measurements already made.
     */
    const categoryChecks = listings
      ? await runDueStaticCategoryChecks(
          listings.map((listing) => ({ chainId: listing.agent.chain_id, tokenId: listing.agent.token_id, category: listing.category })),
        ).catch(() => null)
      : null;

    /*
     * Fixture hires that have since been delivered, graded against the
     * published scenario they were asked. A fixture is funded in one
     * request and delivered later, so nothing that triggers a hire can
     * assemble its own result. Local reads and arithmetic only — no
     * network — so it runs every pass and a check finishes itself once the
     * last delivery lands.
     */
    const paidChecks = (() => {
      try {
        return gradeDuePaidChecks();
      } catch {
        return null;
      }
    })();

    /*
     * The Set and Earn tracker's index: new escrow jobs on both chains by
     * id, and listed agents' registered wallets, so any wallet's hires on
     * any marketplace can be read without scanning the chain per request.
     */
    const questIndex = await Promise.all([indexEscrowJobs(56).catch(() => null), indexEscrowJobs(97).catch(() => null)]);
    // After the index, so the newest jobs are there to be judged.
    const answeredTasks = await checkAnsweredTasks().catch(() => null);

    /*
     * Recover any job Pokter brokered that never reached its own index.
     *
     * The index was written from the browser, so a hire whose wallet
     * returned no receipt hash — which `wallet_sendCalls` routinely does —
     * or whose tab closed at the wrong moment, simply never arrived.
     * Mainnet job 56980 sat funded on chain while /api/v1/activity
     * reported no mainnet jobs at all. Reading the escrow needs no
     * cooperation from any browser, and it is what makes the published
     * counts checkable rather than asserted.
     */
    const reconciled = await reconcileJobIndex().catch(() => null);

    /*
     * Seal what Pokter currently claims, after the sweep has refreshed it
     * and before anyone acts on it.
     *
     * Order matters: sealing first would commit to yesterday's numbers
     * and date them today. A failed seal is swallowed like the rest of
     * the sweep's steps — a missing seal is a gap a reader can see, while
     * a thrown error would lose the probe results this run just gathered.
     */
    const sealed = await publishSeal().catch(() => null);
    const agentWallets = listings
      ? await refreshAgentWallets(listings.map((l) => ({ chainId: l.agent.chain_id, tokenId: l.agent.token_id, name: l.agent.name ?? null }))).catch(() => null)
      : null;

    /*
     * Followed agents: what each looks like now, compared with what its
     * followers last heard. Only read when someone follows something.
     */
    const follows = followedAgents();
    const followerAlerts = follows.length
      ? await listSearchableWithStatus({ limit: 400 })
          .then(({ entries }) => {
            const wanted = new Set(follows.map((f) => `${f.chainId}:${f.tokenId}`));
            const states = new Map<string, { name: string; state: FollowedAgentState }>();
            for (const entry of entries) {
              const key = `${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`;
              if (!wanted.has(key)) continue;
              const day = entry.record.windows.find((w) => w.label === '24h');
              const quote = entry.listing.quote;
              const current = quote && !(quote.expiresAt && Date.parse(quote.expiresAt) <= Date.now());
              states.set(key, {
                name: entry.listing.agent.name,
                state: {
                  answering: day && day.probes > 0 ? (day.ratio ?? 0) > 0 : null,
                  priceU: current ? Number(quote.priceU) : null,
                  delivered: entry.history?.delivered ?? 0,
                  missed: entry.history?.missed ?? 0,
                },
              });
            }
            return notifyFollowers(states);
          })
          .catch(() => null)
      : null;

    return NextResponse.json({
      ...outcome, notifications, notificationFailures,
      hireWatch,
      deliveryRetries,
      sellerNotices,
      stuckJobs,
      funders,
      healthFactorChecks,
      categoryChecks,
      paidChecks,
      questIndex,
      answeredTasks,
      reconciled,
      sealed,
      followerAlerts,
      agentWallets,
      testnetSweep,
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
  } finally {
    sweepRunning = false;
  }
}
