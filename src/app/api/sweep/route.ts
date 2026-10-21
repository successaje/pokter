import { NextResponse } from 'next/server';

import { runSweep } from '@/lib/history/sweep';
import { runBudget } from '@/lib/history/budget';
import { mapWithConcurrency } from '@/lib/concurrency';
import { noteRunStarted } from '@/lib/health/vitals';
import { BSC_TESTNET } from '@/lib/scan/types';
import { checkForNewHires } from '@/lib/alerts/hires';
import { alertChannels, sendOperatorAlert } from '@/lib/alerts/operator';
import { retryStuckDeliveries } from '@/lib/erc8183/delivery-retry';
import { noticeUnansweredJobs } from '@/lib/erc8183/notice-sweep';
import { checkAnsweredTasks } from '@/lib/agent/answered-tasks-sweep';
import { alertStuckJobs } from '@/lib/erc8183/stuck-alert';
import { attributeRecentJobs } from '@/lib/erc8183/attribute-owners';
import { CAMPAIGN_ENDS_AT, isCampaignLive } from '@/lib/campaign/window';
import { campaignHires } from '@/lib/campaign/progress-server';
import { POKTER_MARKETPLACE } from '@/lib/quest/progress';
import { getErc8183DeliverableUrl, getErc8183Job } from '@altananetwork/sdk';
import { altanaNetworkFor } from '@/lib/altana/client';
import { followedAgents, notifyBuilderJobEvent, notifyCampaignReminders, notifyFollowers, notifyJobEvent, notifyLoanWatches, subscribedJobs } from '@/lib/notifications/server';
import { readLoan } from '@/lib/loan-watch/read';
import type { FollowedAgentState } from '@/lib/notifications/agent-changes';
import { getJobStore } from '@/lib/erc8183/store';
import { getAgent } from '@/lib/scan/client';
import { refreshFunders } from '@/lib/funding/store';
import { refreshReviewerFunders } from '@/lib/proof/reviewer-funders';
import { runDueHealthFactorChecks } from '@/lib/assay/run';
import { runDueStaticCategoryChecks } from '@/lib/assay/static-run';
import { gradeDuePaidChecks, gradeDuePaidHfChecks, gradeDuePaidV3Checks } from '@/lib/assay/paid-run';
import { captureFixtureDeliverables } from '@/lib/assay/capture';
import { reconcileJobIndex } from '@/lib/erc8183/reconcile';
import { publishSeal } from '@/lib/seals/run';
import { indexEscrowJobs, refreshAgentWallets } from '@/lib/quest/indexer';
import { getQuestStore } from '@/lib/quest/store';
import { refreshWalletActivity } from '@/lib/activity/store';
import { refreshCapability } from '@/lib/capability/store';
import { JOB_ACTIONS } from '@/lib/capability/match';
import { classify } from '@/lib/agents/categories';
import { listMarketplaceWithStatus, listSearchableWithStatus } from '@/lib/marketplace';
import type { ChainId } from '@/lib/scan/types';
import { getProbeStore } from '@/lib/history/store';
import { SWEEP_BUDGET_MS, SWEEP_RUN_BUDGET_MS, sweepRecent } from '@/lib/history/schedule';

export const dynamic = 'force-dynamic';
/** The platform's ceiling. The run's own budget is below it, deliberately. */
export const maxDuration = 300;

/** Testnet probes a shallower roster, so it takes the smaller share. */
const TESTNET_BUDGET_MS = 45_000;

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
    // `standDown`, not `skipped`: a completed sweep already reports `skipped`, the agents it could not probe.
    return NextResponse.json({ standDown: 'running', note: 'A sweep is already running.' }, { status: 409 });
  }
  const last = getProbeStore().lastSweep();
  if (new URL(request.url).searchParams.get('force') !== '1' && sweepRecent(last?.finishedAt ?? null, Date.now())) {
    return NextResponse.json({ standDown: 'recent', lastFinishedAt: last?.finishedAt ?? null });
  }

  sweepRunning = true;
  try {
    /*
     * One clock for the whole run, and one signal.
     *
     * The budget is what makes this a run with an end: every step below asks
     * it for permission, and the slow optional ones at the bottom are the
     * first to be refused. See `SWEEP_RUN_BUDGET_MS`.
     *
     * The signal is the request's, or the budget's, whichever fires first.
     * The route is reached from the in-process scheduler and from GitHub's
     * cron, and either caller can go away mid-run — the scheduler on its own
     * timeout, the cron when the connection drops. Until now the work carried
     * on regardless, against third-party endpoints, on the one CPU the site
     * is served from.
     */
    const budget = runBudget(SWEEP_RUN_BUDGET_MS);
    /* Every run comes through here, whichever trigger sent it, so this is
       where a run's start is worth recording for `/api/health` to report. */
    noteRunStarted(new Date().toISOString());
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(SWEEP_RUN_BUDGET_MS)]);

    /*
     * The measurement is not optional, so it is not a budgeted step: it runs
     * first, there is always time for it, and if it throws the run reports a
     * failure rather than an empty success. Everything after it is optional
     * by design — that is what every `.catch(() => null)` below already says.
     */
    const outcome = await runSweep({
      signal,
      budgetMs: Math.min(SWEEP_BUDGET_MS, budget.remaining()),
    });

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
    const testnetSweep = await budget.step('testnetSweep', () =>
      runSweep({
        chainId: BSC_TESTNET,
        perCategory: 6,
        registryDepth: 50,
        // A smaller share of the run than mainnet, for the reason above: a
        // testnet agent is far likelier to answer, so each one costs more.
        maxAgents: 20,
        budgetMs: Math.min(TESTNET_BUDGET_MS, budget.remaining()),
        signal,
      }),
    );
    /*
     * One escrow read per subscribed job, a few at a time.
     *
     * This was `Promise.allSettled` over the whole subscription list, which
     * is the shape `lib/net/bounded.ts` warns about: a fan-out that grows
     * with the product until the day it does not fit. Every subscriber added
     * one more simultaneous RPC call, on the one CPU the site is served from.
     * The cap is the same four the sweep itself probes at.
     *
     * The task catches its own failure, because `mapWithConcurrency` rejects
     * on an uncaught throw — and a notification that could not be sent must
     * not cost the measurements this run already took.
     */
    const notificationResults = await budget.step('notifications', () =>
      mapWithConcurrency(subscribedJobs(), 4, async ({ chainId, jobId }) => {
        try {
          // Every escrow Pokter has funded hires on, not only the default.
          if (chainId !== 56 && chainId !== 97) return { sent: 0, failed: false };
          const job = await getErc8183Job(altanaNetworkFor(chainId), BigInt(jobId));
          const { sent } = await notifyJobEvent({ chainId, jobId, status: job.statusName, agentName: getJobStore().byId(`${chainId}:${jobId}`)?.agentName });
          return { sent, failed: false };
        } catch {
          return { sent: 0, failed: true };
        }
      }),
    );
    const notifications = (notificationResults ?? []).reduce((sum, result) => sum + result.sent, 0);
    const notificationFailures = (notificationResults ?? []).filter((result) => result.failed).length;
    /*
     * Job reconciliation, a few at a time, for the same reason.
     *
     * The heaviest fan-out in the run: every row costs an escrow read, often
     * a deliverable read, and for a row with a registry owner a lookup and a
     * mail send as well. It was every job Pokter has ever brokered, at once.
     */
    const builderResults = await budget.step('reconcileJobs', () =>
      mapWithConcurrency(
        getJobStore().all().filter((job) => job.chainId === 56 || job.chainId === 97),
        4,
        async (job) => {
          /*
           * The escrow read, caught here rather than by the caller.
           *
           * `Promise.allSettled` used to absorb this; `mapWithConcurrency`
           * rejects on an uncaught throw, which would turn one unreadable job
           * into a lost reconciliation pass for every other job in the list.
           */
          try {
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
                sent: 0, reconciled: true,
                notificationSkipped: true, notificationFailed: false,
              };
            }

            try {
              const agent = await getAgent((job.agentChainId ?? 56) as ChainId, job.agentTokenId);
              const email = await notifyBuilderJobEvent({
                owner: agent.owner_address, chainId: job.chainId, jobId: job.jobId,
                agentName: job.agentName, status: onchain.statusName, expiredAt: onchain.expiredAt,
              });
              return { sent: email.sent, reconciled: true, notificationSkipped: false, notificationFailed: false };
            } catch {
              // A temporary registry or mail-path failure must never roll back a
              // successful read of the canonical ERC-8183 job state.
              return {
                sent: 0, reconciled: true,
                notificationSkipped: false, notificationFailed: true,
              };
            }
          } catch {
            // Could not read the job at all: nothing was reconciled, and the
            // run says so rather than counting it as repaired.
            return {
              sent: 0, reconciled: false,
              notificationSkipped: false, notificationFailed: false,
              unreadable: true,
            };
          }
        },
      ),
    );
    const builderEmails = (builderResults ?? []).reduce((sum, result) => sum + (result?.sent ?? 0), 0);
    /*
     * Hire watching rides the sweep because the sweep is already scheduled,
     * already secret-guarded, and already the thing that runs when nobody is
     * watching. A second cron would be a second thing to notice had stopped.
     *
     * Settled rather than awaited bare: a watcher failure must not fail the
     * sweep, which has already done the measuring by this point.
     */
    const hireWatch = await budget.step('hireWatch', () => checkForNewHires());

    /*
     * Deliver anything whose notification never arrived. Runs after the
     * reconciliation above, so the statuses it reads are the ones this sweep
     * just refreshed, and caught like the watcher because a retry failing
     * must not cost us the measurement the sweep already did.
     */
    const deliveryRetries = await budget.step('deliveryRetries', () => retryStuckDeliveries());

    /*
     * Outside sellers, on every escrow chain: tell any that were never told
     * their job is funded (a buyer who closed the tab first), and keep what
     * they answer. The retry above only ever covered Pokter's own seller.
     */
    const sellerNotices = await budget.step('sellerNotices', () => noticeUnansweredJobs());

    /*
     * After the retry, not instead of it. What matters is the jobs still
     * unmoved once the automatic attempt has had its go — the retry trying
     * and failing used to look identical to the retry succeeding, because
     * neither said anything.
     */
    const stuckJobs = await budget.step('stuckJobs', () => alertStuckJobs());

    /*
     * Who owned each newly funded job's agent, read while the funding is
     * still recent enough to say. A job this misses stays unattributed;
     * a later run never fills it in with whoever owns the agent by then.
     */
    const jobOwners = await budget.step('jobOwners', () => attributeRecentJobs());

    /* Set and Earn reminders: deadline emails as they come due, and a note when a watched wallet hires another agent. */
    /* Venus liquidation alerts: every confirmed watch read once per sweep, emailed only when the alert policy says so. */
    const loanWatches = await budget.step('loanWatches', () =>
      notifyLoanWatches({
        nowMs: Date.now(),
        read: async (wallet) => {
          const r = await readLoan(wallet as `0x${string}`);
          return { healthFactor: r.healthFactor, borrowUsd: r.borrowUsd, block: r.block };
        },
      }),
    );

    const campaignReminders = await budget.step('campaignReminders', () =>
      isCampaignLive()
        ? notifyCampaignReminders({
            nowMs: Date.now(),
            endsAtMs: CAMPAIGN_ENDS_AT.getTime(),
            hiresOf: async (wallet) => {
              const { summary } = await campaignHires(wallet);
              return { distinctAgents: summary.distinctAgents, marketplaces: summary.namedMarketplaces.map((m) => (m === POKTER_MARKETPLACE ? 'Pokter' : m)) };
            },
          })
        : Promise.resolve({ checked: 0, sent: 0 }),
    );

    /*
     * Who first funded each mainnet owner wallet, so agents run from
     * several wallets count as one operator in "Most reliable". Bounded per
     * run and off without NODEREAL_API_KEY; last, because nothing above
     * depends on it and a slow lookup must not cost the measurements.
     */
    const listings = await budget.step('listings', () =>
      listMarketplaceWithStatus({ limit: 400 }).then(({ sections }) =>
        sections.flatMap(({ listings: l }) => l),
      ),
    );
    const funders = listings
      ? await budget.step('funders', () =>
          refreshFunders(listings.filter((l) => l.agent.chain_id === 56).map((l) => l.agent.owner_address)),
        )
      : null;
    // The same lookup for the wallets that reviewed listed agents, for the review-pattern check.
    const reviewerFunders = listings
      ? await budget.step('reviewerFunders', () => refreshReviewerFunders(listings.map((l) => l.agent)))
      : null;

    /*
     * Health factor checks: a few listed health-factor agents per run, each
     * asked about real Venus positions and compared with Pokter's own
     * reading. Last and caught, like the funders, so a slow agent cannot
     * cost the measurements above.
     */
    const healthFactorChecks = listings
      ? await budget.step('healthFactorChecks', () =>
          runDueHealthFactorChecks(
            listings.filter((l) => l.category === 'health-factor').map((l) => ({ chainId: l.agent.chain_id, tokenId: l.agent.token_id })),
          ),
        )
      : null;

    /*
     * Deterministic category checks for the other four categories. These
     * use published fixed scenarios, not live market data, and their UI says
     * so. Two agents at most per sweep bounds this work, and failure is
     * isolated so it cannot erase the availability measurements already made.
     */
    const categoryChecks = listings
      ? await budget.step('categoryChecks', () =>
          runDueStaticCategoryChecks(
            listings.map((listing) => ({ chainId: listing.agent.chain_id, tokenId: listing.agent.token_id, category: listing.category })),
          ),
        )
      : null;

    /*
     * Fixture hires that have since been delivered, graded against the
     * published scenario they were asked. A fixture is funded in one
     * request and delivered later, so nothing that triggers a hire can
     * assemble its own result. Local reads and arithmetic only — no
     * network — so it runs every pass and a check finishes itself once the
     * last delivery lands.
     */
    // Outside agents' deliveries live at their own URLs: fetched and checked
    // against the on-chain hash first, so the graders below can read them.
    const capturedDeliverables = await budget.step('capturedDeliverables', () => captureFixtureDeliverables());
    const paidChecks = await budget.step('paidChecks', () => gradeDuePaidChecks());
    // Health factor fixtures read Venus, so they are graded separately and
    // caught: a slow or failing RPC must not cost the measurements above.
    const paidHfChecks = await budget.step('paidHfChecks', () => gradeDuePaidHfChecks());
    // Position ranges read different contracts, and fail independently.
    const paidV3Checks = await budget.step('paidV3Checks', () => gradeDuePaidV3Checks());

    /*
     * The Set and Earn tracker's index: new escrow jobs on both chains by
     * id, and listed agents' registered wallets, so any wallet's hires on
     * any marketplace can be read without scanning the chain per request.
     */
    const questIndex = await budget.step('questIndex', () =>
      // Both chains, one at a time: each walks an escrow's jobs, and the
      // pair ran together on the one CPU that also serves the site.
      mapWithConcurrency([56, 97] as const, 1, (chain) => indexEscrowJobs(chain).catch(() => null)),
    );
    // After the index, so the newest jobs are there to be judged.
    const answeredTasks = await budget.step('answeredTasks', () => checkAnsweredTasks());

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
    const reconciled = await budget.step('reconciled', () => reconcileJobIndex());

    /*
     * Seal what Pokter currently claims, after the sweep has refreshed it
     * and before anyone acts on it.
     *
     * Order matters: sealing first would commit to yesterday's numbers
     * and date them today. A failed seal is swallowed like the rest of
     * the sweep's steps — a missing seal is a gap a reader can see, while
     * a thrown error would lose the probe results this run just gathered.
     */
    const sealed = await budget.step('sealed', () => publishSeal());
    const agentWallets = listings
      ? await budget.step('agentWallets', () =>
          refreshAgentWallets(listings.map((l) => ({ chainId: l.agent.chain_id, tokenId: l.agent.token_id, name: l.agent.name ?? null }))),
        )
      : null;
    /*
     * What listed agents' wallets have done on chain: transactions sent, and
     * whether each is a contract wallet. Read once a day per wallet and
     * bounded per pass; after the wallets themselves, which it reads from.
     */
    const listed = new Set((listings ?? []).map((l) => `${l.agent.chain_id}:${l.agent.token_id}`));
    const walletActivity = listings
      ? await budget.step('walletActivity', () =>
          refreshWalletActivity(
            getQuestStore()
              .allAgentWallets()
              .filter((w) => listed.has(`${w.chainId}:${w.tokenId}`))
              .map((w) => ({ chainId: w.chainId, agentWallet: w.wallet })),
          ),
        )
      : null;

    /*
     * Whether listed agents were seen doing their job on chain: Venus
     * lending calls and PancakeSwap swaps from their agent wallet, for the
     * categories whose job can happen on chain. Their own descriptions only
     * shape the wording; the wallet is the evidence. Daily per wallet,
     * bounded per pass, and off without NODEREAL_API_KEY.
     */
    const onChainJobs = new Set((listings ?? []).filter((l) => JOB_ACTIONS[classify(l.agent)]).map((l) => `${l.agent.chain_id}:${l.agent.token_id}`));
    const capability = onChainJobs.size
      ? await budget.step('capability', () =>
          refreshCapability(
            getQuestStore()
              .allAgentWallets()
              .filter((w) => onChainJobs.has(`${w.chainId}:${w.tokenId}`))
              .map((w) => ({ chainId: w.chainId, wallet: w.wallet })),
          ),
        )
      : null;

    /*
     * Followed agents: what each looks like now, compared with what its
     * followers last heard. Only read when someone follows something.
     */
    const follows = followedAgents();
    const followerAlerts = follows.length
      ? await budget.step('followerAlerts', () =>
          listSearchableWithStatus({ limit: 400 }).then(({ entries }) => {
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
          }),
        )
      : null;

    return NextResponse.json({
      ...outcome,
      /*
       * What the run spent and what it shed, so a tail that never gets a
       * turn is visible. `skipped` growing every run means the budget needs
       * raising or a step needs moving out of the web process — not that the
       * step quietly stopped working.
       */
      budget: budget.report(),
      notifications, notificationFailures,
      hireWatch,
      deliveryRetries,
      sellerNotices,
      stuckJobs,
      jobOwners,
      campaignReminders,
      loanWatches,
      funders,
      healthFactorChecks,
      categoryChecks,
      paidChecks,
      paidHfChecks,
      paidV3Checks,
      capturedDeliverables,
      walletActivity,
      reviewerFunders,
      capability,
      questIndex,
      answeredTasks,
      reconciled,
      sealed,
      followerAlerts,
      agentWallets,
      testnetSweep,
      builderNotifications: (builderResults ?? []).length,
      builderEmails,
      reconciledJobs: (builderResults ?? []).filter((result) => result.reconciled).length,
      builderNotificationsSkipped: (builderResults ?? []).filter((result) => result.notificationSkipped).length,
      builderNotificationFailures: (builderResults ?? []).filter((result) => result.notificationFailed).length,
      // A job whose escrow could not be read at all, rather than one whose
      // notification failed after a successful read.
      jobReconciliationFailures: (builderResults ?? []).filter(
        (result) => 'unreadable' in result && result.unreadable,
      ).length,
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
