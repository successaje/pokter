import type { AgentEconomicHistory } from '@/lib/erc8183/economic-history';
import type { FailureLayer } from '@/lib/hire/failure';
import { ATTEMPT_WINDOW_DAYS, buyerAttempts, type HireAttemptRow } from './attempt';
import { requireOwnershipProof, type AgentOwnershipProof } from './authorise';
import { METRIC_DEFINITIONS, UNMEASURED, type MetricDefinition } from './definitions';
import {
  afterQuoteRemediation,
  quoteRemediation,
  type DeliveryStopCode,
  type Remediation,
} from './remediation';

/**
 * The answer to "why aren't buyers successfully hiring my agent?", from
 * what Pokter has actually recorded.
 *
 * Three rules hold the whole file together.
 *
 * **Pokter's own traffic is not demand.** Pokter calls every listed agent
 * on a schedule and asks it for a price; it funds lifecycle demonstrations
 * to prove the escrow rail works; its team funds test hires. Each of those
 * produces a row that looks exactly like a buyer's, and a dashboard that
 * folded them in would tell a builder with no customers that they have
 * several. So every count here is of outside activity, and what was left
 * out is reported as a number beside it rather than silently dropped —
 * `excluded` exists so a builder can see the size of the thing they are
 * not being shown.
 *
 * **A zero is a claim.** "No buyer has asked yet" and "buyers asked and
 * were refused" are different answers that render identically as a row of
 * noughts, and the second is an emergency where the first is a Tuesday.
 * `demand.noBuyerYet` separates them, and `demand.measurable` separates
 * both from "the store could not be read", which is not an answer at all.
 *
 * **Every number carries its definition.** `definitions` travels with the
 * report rather than living in the page's copy, so a figure cannot be
 * re-used somewhere else with its window or its denominator left behind.
 */

export interface DeliveryFailure {
  jobId: string;
  escrowChainId: number;
  kind: DeliveryStopCode;
  at: string;
  /**
   * What the seller said, already through `sanitiseFailureReason`, or null
   * when it said nothing. The string `[withheld: could not be bounded]`
   * means it said something the sanitiser would not pass.
   */
  sellerReason: string | null;
}

export interface DiagnosticsInput {
  now: number;
  windowDays?: number;
  /** False when the attempt store could not be opened: not the same as empty. */
  attemptsReadable: boolean;
  attempts: readonly HireAttemptRow[];
  /** Tab-session hire-flow opens; null when the funnel store could not be read. */
  hireFlowOpens: number | null;
  /** Signed quotes recorded on the way to a funding call, in the window. */
  signedPrices: number;
  /** Outside-funded jobs whose hire landed inside the window. */
  fundedInWindow: number;
  /**
   * Jobs a declared Pokter wallet funded, counted where the jobs are.
   *
   * Not derived from `history.jobs - outsideTeam.jobs - selfHire`: a job
   * can be both team-funded and a self-hire, and subtracting both would
   * take it off twice and report a negative. The collector has the rows
   * and `fundedByTeam`, so it answers this directly.
   */
  teamFunded: number;
  /** The agent's credited record: demos, team hires and self-hires already split out. */
  history: AgentEconomicHistory;
  deliveryFailures: readonly DeliveryFailure[];
  /** Why Pokter's latest scheduled price request failed, when it did. */
  pokterCheck: { code: string; detail: string | null; sellerReason: string | null; observedAt: string } | null;
  agentWallet: string | null;
  protocols: readonly string[];
}

export interface StoppedGroup {
  code: string;
  layer: FailureLayer | null;
  /** Distinct asks that ended on this code. */
  attempts: number;
  /** Requests those asks took in total, retries included. */
  tries: number;
  /** The denominator, carried so no caller can print a share without it. */
  of: number;
  lastAt: string;
  sellerReason: string | null;
  remediation: Remediation | null;
}

export interface ExcludedCount {
  id: string;
  label: string;
  /**
   * How many were removed, or null when the thing is excluded and Pokter
   * does not hold a total for it.
   *
   * Null rather than 0, because 0 would say "there were none of these",
   * and for Pokter's own scheduled price requests that is false: there
   * have been many and only the latest outcome is kept. Printing 0 on a
   * panel whose argument is "here is what was taken out" would be the
   * same mistake the panel exists to avoid.
   */
  count: number | null;
  why: string;
}

export type HeadlineId =
  | 'blocked-before-any-buyer'
  | 'buyers-stopped'
  | 'deliveries-lapsed'
  | 'priced-not-funded'
  | 'no-buyer-yet'
  | 'nothing-failing'
  | 'not-measurable';

export interface BuilderDiagnostics {
  agent: { chainId: number; tokenId: string; owner: string };
  window: { days: number; from: string; to: string };
  /** The one thing to read first, and what to do about it. */
  headline: { id: HeadlineId; title: string; body: string; remediation: Remediation | null };
  demand: {
    measurable: boolean;
    noBuyerYet: boolean;
    hireFlowOpens: number | null;
    attempts: number;
    quoted: number;
    stopped: number;
    stoppedByCode: StoppedGroup[];
  };
  funding: {
    signedPrices: number;
    fundedInWindow: number;
    /** An upper bound: a buyer who edits and re-asks records a second price. */
    pricedNotFunded: number;
    remediation: Remediation | null;
  };
  delivery: {
    outsideJobs: number;
    terminal: number;
    delivered: number;
    lapsed: number;
    refused: number;
    disputed: number;
    failures: Array<DeliveryFailure & { remediation: Remediation }>;
  };
  /** Pokter's own latest scheduled price request, when it failed. Never demand. */
  pokterCheck: { code: string; observedAt: string; remediation: Remediation | null } | null;
  excluded: ExcludedCount[];
  definitions: readonly MetricDefinition[];
  unmeasured: readonly string[];
}

function group(rows: readonly HireAttemptRow[], of: number, input: DiagnosticsInput): StoppedGroup[] {
  const byCode = new Map<string, StoppedGroup>();
  for (const row of rows) {
    const code = row.code ?? 'unclassified';
    const existing = byCode.get(code);
    if (existing) {
      existing.attempts += 1;
      existing.tries += row.tries;
      if (row.lastAt > existing.lastAt) existing.lastAt = row.lastAt;
      existing.sellerReason ??= row.sellerReason;
      continue;
    }
    byCode.set(code, {
      code,
      layer: row.layer,
      attempts: 1,
      tries: row.tries,
      of,
      lastAt: row.lastAt,
      sellerReason: row.sellerReason,
      remediation: quoteRemediation({
        code,
        sellerReason: row.sellerReason,
        agentWallet: input.agentWallet,
        protocols: input.protocols,
        /* These rows are buyer asks, so a decline here is of the buyer's
           own brief and not of Pokter's scheduled generic request. */
        buyerBrief: true,
      }),
    });
  }
  return [...byCode.values()].sort((a, b) => b.attempts - a.attempts || b.lastAt.localeCompare(a.lastAt));
}

/**
 * The headline, chosen by what a builder can act on soonest.
 *
 * Pokter's own failing price check outranks everything, including a month
 * with no buyers in it — because it is the explanation for the empty month
 * rather than a separate finding. An agent that cannot sign a price for
 * Pokter cannot sign one for anybody: the hire page reads the same
 * endpoint, so "no demand" and "no demand reaches you" look identical from
 * the outside, and only one of them is the builder's to fix.
 */
function headline(
  input: DiagnosticsInput,
  demand: BuilderDiagnostics['demand'],
  funding: BuilderDiagnostics['funding'],
  delivery: BuilderDiagnostics['delivery'],
  check: BuilderDiagnostics['pokterCheck'],
): BuilderDiagnostics['headline'] {
  if (check?.remediation && !check.remediation.transient) {
    return {
      id: 'blocked-before-any-buyer',
      title: 'No buyer can get a price from this agent',
      body: `Pokter's scheduled price request failed with ${check.code}, and the hire page calls the same endpoint the same way. Until this clears, a buyer who opens the hire page sees a refusal rather than a price — so the demand figures below are measuring a closed door, not a quiet market.`,
      remediation: check.remediation,
    };
  }

  const worst = demand.stoppedByCode[0];
  if (worst) {
    return {
      id: 'buyers-stopped',
      title: `${worst.attempts} of ${worst.of} buyer price request${worst.of === 1 ? '' : 's'} stopped on ${worst.code}`,
      body:
        worst.remediation?.reason ??
        `Pokter has no specific fix recorded for ${worst.code}. The layer it failed in was ${worst.layer ?? 'not recorded'}.`,
      remediation: worst.remediation,
    };
  }

  if (delivery.lapsed > 0) {
    return {
      id: 'deliveries-lapsed',
      title: `${delivery.lapsed} funded job${delivery.lapsed === 1 ? '' : 's'} passed the deadline undelivered`,
      body: afterQuoteRemediation('lapsed').reason,
      remediation: afterQuoteRemediation('lapsed'),
    };
  }

  if (funding.pricedNotFunded > 0 && funding.fundedInWindow === 0) {
    return {
      id: 'priced-not-funded',
      title: `${funding.pricedNotFunded} signed price${funding.pricedNotFunded === 1 ? '' : 's'} reached a buyer and none was funded`,
      body: afterQuoteRemediation('priced-not-funded').reason,
      remediation: afterQuoteRemediation('priced-not-funded'),
    };
  }

  if (!demand.measurable) {
    return {
      id: 'not-measurable',
      title: 'Pokter could not read its record of buyer price requests',
      body: 'This is not a reading of zero demand: the store that holds buyer price requests did not answer, so nothing below should be taken as a count of what buyers did. The job and delivery figures are read from the escrow and are unaffected.',
      remediation: null,
    };
  }

  if (demand.noBuyerYet) {
    return {
      id: 'no-buyer-yet',
      title: 'No buyer has asked this agent for a price yet',
      body: 'Nothing here is failing. Pokter has recorded no price request from the hire flow in this window, and Pokter does not count its own scheduled checks as demand. There is nothing to fix in the hire path; what is missing is buyers reaching it.',
      remediation: null,
    };
  }

  return {
    id: 'nothing-failing',
    title: 'Every buyer who asked got a signed price',
    body: `All ${demand.attempts} price request${demand.attempts === 1 ? '' : 's'} in this window ended with a price signed by this agent's registered wallet. Nothing in the quote path is turning buyers away.`,
    remediation: null,
  };
}

export function buildBuilderDiagnostics(
  proof: AgentOwnershipProof,
  input: DiagnosticsInput,
): BuilderDiagnostics {
  /*
   * Asked before a single row is read. The report is the agent's private
   * side, and a future caller that reaches this function without going
   * through `authoriseAgentOwner` gets an exception rather than somebody
   * else's refusals.
   */
  const owner = requireOwnershipProof(proof);
  const days = input.windowDays ?? ATTEMPT_WINDOW_DAYS;
  const to = new Date(input.now).toISOString();
  const from = new Date(input.now - days * 86_400_000).toISOString();

  const buyers = buyerAttempts(input.attempts);
  const trials = input.attempts.filter((row) => row.source === 'trial');
  const stopped = buyers.filter((row) => row.outcome === 'stopped');
  const quoted = buyers.length - stopped.length;

  const demand: BuilderDiagnostics['demand'] = {
    measurable: input.attemptsReadable,
    noBuyerYet: input.attemptsReadable && buyers.length === 0,
    hireFlowOpens: input.hireFlowOpens,
    attempts: buyers.length,
    quoted,
    stopped: stopped.length,
    stoppedByCode: group(stopped, buyers.length, input),
  };

  const funding: BuilderDiagnostics['funding'] = {
    signedPrices: input.signedPrices,
    fundedInWindow: input.fundedInWindow,
    pricedNotFunded: Math.max(0, input.signedPrices - input.fundedInWindow),
    remediation: input.signedPrices > input.fundedInWindow ? afterQuoteRemediation('priced-not-funded') : null,
  };

  const lapsed = input.deliveryFailures.filter((f) => f.kind === 'lapsed').length;
  const refused = input.deliveryFailures.filter((f) => f.kind === 'refused-funded-job').length;
  const disputed = input.deliveryFailures.filter((f) => f.kind === 'disputed').length;
  const delivery: BuilderDiagnostics['delivery'] = {
    outsideJobs: input.history.outsideTeam.jobs,
    terminal: input.history.outsideTeam.terminal,
    delivered: input.history.outsideTeam.completed,
    lapsed,
    refused,
    disputed,
    failures: input.deliveryFailures.map((failure) => ({
      ...failure,
      remediation: afterQuoteRemediation(failure.kind),
    })),
  };

  const check: BuilderDiagnostics['pokterCheck'] = input.pokterCheck
    ? {
        code: input.pokterCheck.code,
        observedAt: input.pokterCheck.observedAt,
        remediation: quoteRemediation({
          code: input.pokterCheck.code,
          detail: input.pokterCheck.detail,
          sellerReason: input.pokterCheck.sellerReason,
          agentWallet: input.agentWallet,
          protocols: input.protocols,
        }),
      }
    : null;

  const excluded: ExcludedCount[] = [
    {
      id: 'pokter-check',
      label: 'Pokter’s own scheduled price requests',
      /*
       * Not a count, because Pokter does not keep one: the sweep replaces
       * one row per agent each run. Reporting 0 here would say Pokter has
       * never called this agent, which is the opposite of true.
       */
      count: null,
      why: 'Pokter asks every listed agent for a price on a schedule so a track record accrues. That is Pokter’s traffic, not a buyer’s. Only the latest outcome is kept, and it is reported on its own below rather than totalled here.',
    },
    {
      id: 'trials',
      label: 'Free trial price requests',
      count: trials.length,
      why: 'A trial is a signed-price request with no wallet behind it — often the builder’s own, or an assistant looking. Counting them as demand would let a builder inflate their own figures by refreshing a page.',
    },
    {
      id: 'team-funded',
      label: 'Jobs Pokter’s own wallets funded',
      count: input.teamFunded,
      why: 'Pokter’s declared team wallets, listed in full on the public receipts page so they can be checked against the chain. Tests of Pokter’s own hire flow, not demand.',
    },
    {
      id: 'self-hire',
      label: 'Jobs this agent funded for itself',
      count: input.history.selfHire,
      why: 'Buyer and seller the same wallet. An operator paying their own agent is not demand, whoever they are.',
    },
    {
      id: 'lifecycle-demos',
      label: 'Lifecycle demonstrations',
      count: input.history.lifecycleDemos,
      why: 'Jobs Pokter’s own seller closed with a receipt and no answer from the agent. They prove the escrow works and say nothing about this agent, so they count neither as a delivery nor as a miss.',
    },
  ];

  return {
    agent: { chainId: owner.chainId, tokenId: owner.tokenId, owner: owner.owner },
    window: { days, from, to },
    headline: headline(input, demand, funding, delivery, check),
    demand,
    funding,
    delivery,
    pokterCheck: check,
    excluded,
    definitions: METRIC_DEFINITIONS,
    unmeasured: UNMEASURED,
  };
}
