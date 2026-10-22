import 'server-only';

import { agentHistory, isLifecycleDemo } from '@/lib/agent/credited-history';
import { agentConversion } from '@/lib/conversion/store';
import { getJobStore } from '@/lib/erc8183/store';
import { briefQuoteOutranksFailure } from '@/lib/hire/blocker';
import { getProbeStore } from '@/lib/history/store';
import { getAgent } from '@/lib/scan/client';
import { teamWalletSet } from '@/lib/team/server';
import { fundedByTeam } from '@/lib/team/wallets';
import { ATTEMPT_WINDOW_DAYS } from './attempt';
import type { AgentOwnershipProof } from './authorise';
import { deliveryFailuresFrom } from './delivery-failures';
import { buildBuilderDiagnostics, type BuilderDiagnostics } from './report';
import { hireAttemptsReadable, readHireAttempts } from './store';

/**
 * Gather what the stores hold for one agent and assemble its diagnostics.
 *
 * Every read is guarded on its own. A builder's dashboard that falls over
 * because one SQLite file is busy is worse than one with a figure missing,
 * and the figures that fail independently are read from different files —
 * so a conversion store that will not open must not take the escrow record
 * down with it. The one thing never guessed at is whether the attempt store
 * was readable: that decides whether an empty demand panel means "nobody
 * asked" or "Pokter cannot say", and the report prints the difference.
 */
export async function collectBuilderDiagnostics(
  proof: AgentOwnershipProof,
  options: { now?: number; windowDays?: number; deliveryLimit?: number } = {},
): Promise<BuilderDiagnostics> {
  const now = options.now ?? Date.now();
  const windowDays = options.windowDays ?? ATTEMPT_WINDOW_DAYS;
  const since = new Date(now - windowDays * 86_400_000);
  const { chainId, tokenId } = proof;

  const attemptsReadable = hireAttemptsReadable();
  const attempts = attemptsReadable ? readHireAttempts(chainId, tokenId, windowDays, new Date(now)) : [];

  /* A nicety, not the dashboard: an unreadable funnel reports null, which
     the panel renders as "not counted" rather than as a zero. */
  let hireFlowOpens: number | null = null;
  try {
    hireFlowOpens = agentConversion(chainId, tokenId, windowDays, new Date(now)).hireOpened;
  } catch {
    hireFlowOpens = null;
  }

  const jobStore = getJobStore();
  let jobs = [] as ReturnType<typeof jobStore.byAgent>;
  try {
    jobs = jobStore.byAgent(chainId, tokenId);
  } catch {
    jobs = [];
  }

  let signedPrices = 0;
  try {
    signedPrices = jobStore.quoteIntentsSince(chainId, tokenId, since.toISOString());
  } catch {
    signedPrices = 0;
  }

  const history = agentHistory(jobs, now);
  const team = teamWalletSet();

  /* Outside-funded jobs whose hire landed in the window, so the funding
     comparison has both halves over the same days. `history.outsideTeam`
     is all-time by design and is reported as that. */
  const funded = jobs.filter((job) => job.status !== 'OPEN' && !isLifecycleDemo(job));
  const fundedInWindow = funded.filter(
    (job) =>
      Date.parse(job.hiredAt) >= since.getTime() &&
      !fundedByTeam(job, team) &&
      String(job.client ?? '').toLowerCase() !== String(job.provider ?? '').toLowerCase(),
  ).length;
  /* Counted here rather than subtracted from totals in the report: a job
     can be both team-funded and a self-hire, and subtracting both would
     remove it twice. `fundedByTeam` is the same rule every other Pokter
     figure uses, including a job with no recorded funder — those are the
     operator-signed demo hires from before buyers signed their own. */
  const teamFunded = funded.filter((job) => fundedByTeam(job, team)).length;

  const deliveryFailures = deliveryFailuresFrom({
    jobs,
    now,
    isLifecycleDemo,
    teamWallets: team,
    noticeFor: (job) => {
      const notice = jobStore.noticeFor(job.chainId, job.jobId);
      return notice ? { status: notice.status, reason: notice.reason, lastAt: notice.lastAt } : null;
    },
    limit: options.deliveryLimit ?? 20,
  });

  /* Narrowed here rather than in the proof: ownership is decided for any
     registry id, and only the indexer lookup is limited to the two chains
     Pokter indexes. An id on neither simply has no indexed record. */
  const record =
    chainId === 56 || chainId === 97 ? await getAgent(chainId, tokenId).catch(() => null) : null;

  /*
   * Pokter's own scheduled price request, and whether Pokter has ever made
   * one that got an answer.
   *
   * `pokterCheckedAt` is the part that cannot be left out. A null check used
   * to mean three different things — the last request succeeded, no request
   * has ever been made, and the probe store would not open — and the panel
   * said "the last scheduled request got a usable signed price" for all
   * three. For an agent Pokter has never swept that is a measurement being
   * reported that never happened, which is the mistake this whole panel
   * exists to avoid.
   *
   * `outranked` is `briefQuoteOutranksFailure`, the same precedence the
   * agent's public page applies through `decideHireBlocker` — read rather
   * than restated, so the two surfaces cannot disagree. Without it a builder
   * whose agent declines Pokter's generic ask and signs for real briefs was
   * told "no buyer can get a price from this agent" on the same report that
   * showed the buyer who got one.
   */
  let pokterCheck: Parameters<typeof buildBuilderDiagnostics>[1]['pokterCheck'] = null;
  let pokterCheckedAt: string | null = null;
  try {
    const probes = getProbeStore();
    const failed = probes.quoteFailureFor(chainId, tokenId);
    const stored = probes.quotesFor([{ chainId, tokenId }]).get(`${chainId}:${tokenId}`) ?? null;
    /* Either answer is evidence a scheduled request was made and landed. */
    pokterCheckedAt = failed?.observedAt ?? stored?.quotedAt ?? null;
    const brief = probes.briefQuote(chainId, tokenId);
    pokterCheck = failed
      ? {
          code: failed.code,
          detail: failed.detail,
          sellerReason: failed.sellerReason,
          observedAt: failed.observedAt,
          outranked: brief !== null && briefQuoteOutranksFailure(failed, brief, now),
        }
      : null;
  } catch {
    pokterCheck = null;
    pokterCheckedAt = null;
  }

  return buildBuilderDiagnostics(proof, {
    now,
    windowDays,
    attemptsReadable,
    attempts,
    hireFlowOpens,
    signedPrices,
    fundedInWindow,
    teamFunded,
    history,
    deliveryFailures,
    pokterCheck,
    pokterCheckedAt,
    /* The registered wallet and declared transports, for the two blocker
       cases that name them: a quote signed by a wallet other than the
       agent's own, and an MCP-only listing that can be measured but never
       priced. A record the indexer has not got is not a reason to withhold
       the rest of the report, so both fall back to unknown. */
    agentWallet: record?.agent_wallet ?? null,
    protocols: Object.keys(record?.services ?? {}),
  });
}
