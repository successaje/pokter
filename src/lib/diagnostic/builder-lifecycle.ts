import type { DiagnosticCheck } from './checks';

export interface BuilderLifecycle {
  registered: boolean;
  profileReady: boolean;
  categoryReady: boolean;
  endpointReady: boolean;
  quoteReady: boolean;
  /** The signed price is in a currency an escrow Pokter runs can actually pay. */
  quotePayable: boolean;
  enrolled: boolean;
  measured: boolean;
  listed: boolean;
  /**
   * A buyer could fund a hire right now.
   *
   * This used to be called `hireable`, and that word was doing damage. It
   * was true the moment an identity, an endpoint and a signed quote
   * existed — before anything had been delivered and before any money had
   * moved — and the step carrying it was labelled "Hireable", so the
   * dashboard announced the end state at the fourth of five stages. A
   * fundable agent is one a buyer can pay. Whether it then delivers, and
   * whether the escrow settles, are the two facts that were being
   * claimed without being checked.
   */
  fundable: boolean;
  /** A funded job was delivered by the agent and the escrow released. */
  proven: boolean;
  delivery: ReadinessDelivery;
  probeCount: number;
}

/** The six milestones, in the order a builder meets them. */
export type ReadinessId = 'built' | 'endpoint' | 'identity' | 'quote' | 'delivered' | 'settled';

/**
 * How far a milestone got.
 *
 * `waiting` is the state the five-step ladder did not have, and its
 * absence is what made the old dashboard dishonest in the other
 * direction: a quote cannot be asked for before an identity exists, so an
 * unregistered agent was shown a cross against a check Pokter had never
 * attempted. A cross says "you failed this"; `waiting` says "this comes
 * after registration", which is what is true.
 */
export type ReadinessState = 'done' | 'failed' | 'todo' | 'waiting';

export interface ReadinessMilestone {
  id: ReadinessId;
  label: string;
  /**
   * The milestone named inside a sentence.
   *
   * Lower-casing the label to list what is unproven turned "Signed quote
   * Pokter can pay" into "signed quote pokter can pay" on the rendered
   * page - a product name in lower case, in the one line whose job is to
   * be trusted. Each milestone carries its own sentence form instead.
   */
  shortName: string;
  state: ReadinessState;
  /** What Pokter observed, in a sentence. Never advice. */
  detail: string;
  /** Why it is not done. Null when it is. */
  reason: string | null;
  /** The next thing to change. Null when there is nothing to change yet. */
  fix: string | null;
  /** How to check it again once the fix is in. */
  retest: ReadinessRetest | null;
  /** What earning this milestone proves — and, where it matters, what it still does not. */
  proves: string;
}

/**
 * The retest offered against a milestone.
 *
 * `kind` exists because the same milestone is retested differently
 * depending on where it is rendered: the import page holds a live
 * diagnostic it can re-run in place, and a server-rendered manage page can
 * only link to it. A surface that has the live action wires `recheck` to a
 * button; every surface can fall back to `href`.
 */
export interface ReadinessRetest {
  kind: 'recheck' | 'register' | 'job-status' | 'hire';
  label: string;
  href: string | null;
}

export interface ReadinessDelivery {
  /** Funded jobs Pokter has indexed for this agent, whatever became of them. */
  funded: number;
  /** Of those, ones where a deliverable reached escrow. */
  delivered: number;
  /** Of those deliveries, ones submitted by the agent's own published wallet. */
  deliveredByAgent: number;
  /** Deliveries that reached escrow from some other wallet — a courier or an operator. */
  deliveredByOthers: number;
  /** Escrow released, with the transaction that released it on record. */
  settled: number;
  /** The same wallet on both sides. The escrow refuses to settle these. */
  selfHires: number;
  /** Funded by a wallet the owner holds: a real test, and not customer demand. */
  ownFunded: number;
}

export interface ReadinessJob {
  status: string;
  deliverableUrl: string | null;
  settleTxHash: string | null | undefined;
  client?: string | null;
  provider?: string | null;
}

export const EMPTY_DELIVERY: ReadinessDelivery = {
  funded: 0,
  delivered: 0,
  deliveredByAgent: 0,
  deliveredByOthers: 0,
  settled: 0,
  selfHires: 0,
  ownFunded: 0,
};

function passed(checks: DiagnosticCheck[], id: string) {
  return checks.some((check) => check.id === id && check.status === 'pass');
}

function failed(checks: DiagnosticCheck[], id: string) {
  return checks.some((check) => check.id === id && check.status === 'fail');
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b) && a!.toLowerCase() === b!.toLowerCase();

/**
 * What this agent's funded jobs actually show, counted rather than inferred.
 *
 * Who delivered and who paid are separate facts, and the two milestones at
 * the end of the ladder each turn on one of them. A delivery submitted by
 * Pokter's courier is a buyer served and not evidence the agent can
 * deliver; a job with one wallet on both sides is not a test the escrow
 * will even settle. Both are counted and named rather than folded into a
 * total that would read as something it is not.
 */
export function summariseReadinessDelivery(
  jobs: readonly ReadinessJob[],
  context: { agentWallet?: string | null; ownerAddresses?: readonly string[] } = {},
): ReadinessDelivery {
  const owners = (context.ownerAddresses ?? []).filter(Boolean);
  const summary = { ...EMPTY_DELIVERY };
  for (const job of jobs) {
    if (job.status === 'OPEN') continue;
    summary.funded += 1;
    if (same(job.client, job.provider)) summary.selfHires += 1;
    if (owners.some((owner) => same(owner, job.client))) summary.ownFunded += 1;
    const hasDeliverable = Boolean(job.deliverableUrl);
    const reachedEscrow = job.status === 'SUBMITTED' || job.status === 'COMPLETED';
    if (hasDeliverable && reachedEscrow) {
      summary.delivered += 1;
      if (same(job.provider, context.agentWallet)) summary.deliveredByAgent += 1;
      else summary.deliveredByOthers += 1;
    }
    if (job.status === 'COMPLETED' && job.settleTxHash) summary.settled += 1;
  }
  return summary;
}

/** Derive builder-facing states only from observations Pokter can substantiate. */
export function deriveBuilderLifecycle({
  chainId,
  checks,
  enrolled,
  probeCount,
  delivery = EMPTY_DELIVERY,
}: {
  chainId: number;
  checks: DiagnosticCheck[];
  enrolled: boolean;
  probeCount: number;
  delivery?: ReadinessDelivery;
}): BuilderLifecycle {
  const registered = passed(checks, 'identity');
  const profileReady = passed(checks, 'card');
  const categoryReady = passed(checks, 'category');
  const endpointReady = passed(checks, 'endpoint') && passed(checks, 'liveness');
  const quoteReady = passed(checks, 'quote');
  const quotePayable = quoteReady && !failed(checks, 'quote-settles');
  const independentlyAttested = passed(checks, 'attestations');
  const measured = probeCount > 0 || independentlyAttested;
  /*
   * Either chain the campaign recognises.
   *
   * This was mainnet only, so a builder who registered on testnet — the
   * only chain where their agent can perform its own onchain actions, and
   * therefore the only one where it can satisfy the campaign's execution
   * bar — was told by their own dashboard that they were not listed.
   * Pokter lists both now; see LISTED_CHAINS.
   */
  const listed = (chainId === 56 || chainId === 97) && registered;
  const fundable = registered && endpointReady && quotePayable;
  const proven = delivery.deliveredByAgent > 0 && delivery.settled > 0;
  return {
    registered,
    profileReady,
    categoryReady,
    endpointReady,
    quoteReady,
    quotePayable,
    enrolled,
    measured,
    listed,
    fundable,
    proven,
    delivery,
    probeCount,
  };
}

const KIT = '/build/integration';

/**
 * The builder's six milestones, from an agent that exists to money that
 * arrived.
 *
 * Replaces a five-step ladder whose fourth step was labelled "Hireable"
 * and earned by a signed quote. That told builders they had finished
 * while two of the things a buyer is actually buying — a delivery, and a
 * settlement — had never been observed at all. The last two milestones
 * are now their own, and nothing short of them claims the end state.
 *
 * The first two milestones are deliberately free of identity: an agent
 * can be built and its endpoint checked before anything is registered,
 * and demanding registration first both reverses the real order of work
 * and marks an unregistered builder as failing checks Pokter never ran.
 *
 * Campaign qualification is not inferred here, and never has been. It is
 * a separate, optional goal with its own rules; see
 * `lib/campaign/build-qualification`.
 */
export function builderReadinessMilestones(
  lifecycle?: BuilderLifecycle,
  context: { chainId?: number; tokenId?: string } = {},
): ReadinessMilestone[] {
  const delivery = lifecycle?.delivery ?? EMPTY_DELIVERY;
  const recheckHref =
    context.chainId && context.tokenId
      ? `/build/import?chainId=${context.chainId}&tokenId=${encodeURIComponent(context.tokenId)}`
      : '/build/import';
  const recheck = (label = 'Run the checks again'): ReadinessRetest => ({ kind: 'recheck', label, href: recheckHref });

  const built = builtMilestone(lifecycle, recheck);
  const endpoint = endpointMilestone(lifecycle, recheck);
  const identity = identityMilestone(lifecycle);
  const quote = quoteMilestone(lifecycle, identity.state === 'done', recheck);
  const delivered = deliveredMilestone(lifecycle, delivery, identity.state === 'done', context);
  const settled = settledMilestone(delivery, delivered.state === 'done');
  return [built, endpoint, identity, quote, delivered, settled];
}

function builtMilestone(lifecycle: BuilderLifecycle | undefined, recheck: (label?: string) => ReadinessRetest): ReadinessMilestone {
  const proves =
    'Something answered at the address you published and named work a buyer could ask for. Pokter cannot see a machine on your desk, so this is the earliest point at which "built" is a fact rather than a claim.';
  if (lifecycle?.profileReady) {
    return {
      id: 'built',
      label: 'Built',
      shortName: 'built',
      state: 'done',
      detail: 'Pokter read an agent card and the skills it declares.',
      reason: null,
      fix: null,
      retest: null,
      proves,
    };
  }
  const reachable = Boolean(lifecycle?.endpointReady);
  return {
    id: 'built',
    label: 'Built',
    shortName: 'built',
    state: reachable ? 'failed' : 'todo',
    detail: reachable
      ? 'The endpoint answered but Pokter could read no skills from its agent card.'
      : 'Pokter has not reached an agent card yet.',
    reason: reachable
      ? 'A card with no skills array gives a buyer nothing to address a brief to.'
      : 'Nothing has answered at a published address, so there is no card to read.',
    fix: reachable
      ? 'Publish a skills array on the agent card, naming the work rather than the implementation.'
      : 'Run your agent somewhere Pokter can call it, then check the endpoint below.',
    retest: recheck(),
    proves,
  };
}

function endpointMilestone(lifecycle: BuilderLifecycle | undefined, recheck: (label?: string) => ReadinessRetest): ReadinessMilestone {
  const proves =
    'The published endpoint answered a call made from Pokter’s own servers, the way a buyer’s hire calls it. It does not prove the answers are correct.';
  if (lifecycle?.endpointReady) {
    return {
      id: 'endpoint',
      label: 'Public endpoint checked',
      shortName: 'a public endpoint check',
      state: 'done',
      detail: lifecycle.enrolled
        ? 'It answered Pokter’s live checks and is on the probe schedule.'
        : 'It answered Pokter’s live checks. It is not on the probe schedule yet.',
      reason: lifecycle.enrolled ? null : 'Pokter could not write it to the probe schedule, so no ongoing record is being built.',
      fix: lifecycle.enrolled ? null : 'Nothing to fix on your side. Running the check again retries the schedule write.',
      retest: lifecycle.enrolled ? null : recheck('Retry the schedule write'),
      proves,
    };
  }
  return {
    id: 'endpoint',
    label: 'Public endpoint checked',
    shortName: 'a public endpoint check',
    state: 'failed',
    detail: 'The published endpoint did not answer Pokter’s call.',
    reason: 'A hire is a call to this address from a server that holds none of your credentials. Nothing reachable means nothing hireable.',
    fix: `Serve it over public https, answer anonymous calls, and return well-formed JSON. The failing check above names which part. ${KIT}#transports explains each.`,
    retest: recheck(),
    proves,
  };
}

function identityMilestone(lifecycle: BuilderLifecycle | undefined): ReadinessMilestone {
  const proves =
    'An ERC-8004 identity exists, you own it, and it publishes the wallet whose signatures Pokter will check. It says nothing about the agent behind it.';
  if (lifecycle?.registered) {
    return {
      id: 'identity',
      label: 'Identity and signing wallet',
      shortName: 'an identity and signing wallet',
      state: 'done',
      detail: 'Registered, with a signing wallet published in the registry record.',
      reason: null,
      fix: null,
      retest: null,
      proves,
    };
  }
  return {
    id: 'identity',
    label: 'Identity and signing wallet',
    shortName: 'an identity and signing wallet',
    state: 'todo',
    detail: 'No ERC-8004 identity with a published signing wallet yet.',
    reason: 'Without a signing wallet on record there is nothing to check a signature against, so nothing the agent signs can be trusted here.',
    fix: 'Register the identity, or enter an existing agent ID and publish an agent wallet on it.',
    retest: { kind: 'register', label: 'Register an identity', href: '/build/new' },
    proves,
  };
}

function quoteMilestone(
  lifecycle: BuilderLifecycle | undefined,
  identityDone: boolean,
  recheck: (label?: string) => ReadinessRetest,
): ReadinessMilestone {
  const proves =
    'A buyer can be handed a price signed by the agent’s own wallet, in a currency an escrow Pokter runs can pay. It is the last milestone before money moves, not the point at which the agent is proven.';
  if (lifecycle?.quotePayable) {
    return {
      id: 'quote',
      label: 'Signed quote Pokter can pay',
      shortName: 'a signed quote Pokter can pay',
      state: 'done',
      detail: 'It returned a signed price, and the escrow can settle in that currency.',
      reason: null,
      fix: null,
      retest: null,
      proves,
    };
  }
  if (!identityDone) {
    return {
      id: 'quote',
      label: 'Signed quote Pokter can pay',
      shortName: 'a signed quote Pokter can pay',
      state: 'waiting',
      detail: 'Not attempted: a quote is signed by the wallet on the registry record.',
      reason: 'This comes after registration. It is not a failed check.',
      fix: null,
      retest: null,
      proves,
    };
  }
  if (lifecycle?.quoteReady) {
    return {
      id: 'quote',
      label: 'Signed quote Pokter can pay',
      shortName: 'a signed quote Pokter can pay',
      state: 'failed',
      detail: 'It signed a price, and the escrow cannot pay it.',
      reason: 'The currency or chain in the quote is not one an escrow Pokter runs settles in, so a buyer would be quoted and then stopped.',
      fix: `Quote in $U on the chain you want to be hired on. The token addresses are in ${KIT}#quote.`,
      retest: recheck('Ask for a quote again'),
      proves,
    };
  }
  return {
    id: 'quote',
    label: 'Signed quote Pokter can pay',
    shortName: 'a signed quote Pokter can pay',
    state: 'failed',
    detail: 'No signed price Pokter could use.',
    reason: 'A card that declares a negotiation skill is not a signed quote, and a price without a signature cannot be bound to you.',
    fix: `Answer negotiate with negotiation_hash, provider_sig, negotiated_at and terms, signed by the agent wallet on your registry record. ${KIT}#quote has a worked example.`,
    retest: recheck('Ask for a quote again'),
    proves,
  };
}

function deliveredMilestone(
  lifecycle: BuilderLifecycle | undefined,
  delivery: ReadinessDelivery,
  identityDone: boolean,
  context: { chainId?: number; tokenId?: string },
): ReadinessMilestone {
  const proves =
    'A funded job was delivered by the agent’s own wallet and Pokter recorded where the deliverable is. A test you funded yourself proves the mechanism, not demand.';
  const jobsHref = '/build/jobs';
  const hireHref = context.chainId && context.tokenId ? `/hire/${context.chainId}/${context.tokenId}` : '/discover';
  if (delivery.deliveredByAgent > 0) {
    return {
      id: 'delivered',
      label: 'Funded test job delivered',
      shortName: 'a delivered test job',
      state: 'done',
      detail: `${delivery.deliveredByAgent} of ${delivery.funded} funded ${delivery.funded === 1 ? 'job' : 'jobs'} delivered from the agent’s own wallet.`,
      reason: null,
      fix: null,
      retest: null,
      proves,
    };
  }
  if (!identityDone || !lifecycle?.fundable) {
    return {
      id: 'delivered',
      label: 'Funded test job delivered',
      shortName: 'a delivered test job',
      state: 'waiting',
      detail: 'Not attempted: a job cannot be funded until a buyer can be quoted.',
      reason: 'This comes after the four milestones above. It is not a failed check.',
      fix: null,
      retest: null,
      proves,
    };
  }
  if (delivery.deliveredByOthers > 0) {
    return {
      id: 'delivered',
      label: 'Funded test job delivered',
      shortName: 'a delivered test job',
      state: 'failed',
      detail: `${delivery.deliveredByOthers} ${delivery.deliveredByOthers === 1 ? 'delivery' : 'deliveries'} reached escrow from a wallet other than the agent’s.`,
      reason: 'The buyer was served, and not by the agent. A courier delivery is not evidence that the agent can deliver.',
      fix: `Submit the deliverable from the agent wallet on your registry record. ${KIT}#delivery shows the call.`,
      retest: { kind: 'job-status', label: 'Refresh job status', href: jobsHref },
      proves,
    };
  }
  if (delivery.funded > 0) {
    return {
      id: 'delivered',
      label: 'Funded test job delivered',
      shortName: 'a delivered test job',
      state: 'failed',
      detail: `${delivery.funded} funded ${delivery.funded === 1 ? 'job' : 'jobs'}, no deliverable at escrow yet.`,
      reason:
        delivery.selfHires > 0
          ? `${delivery.selfHires} of them have the same wallet on both sides, which the escrow refuses to settle.`
          : 'Delivery begins only once the agent accepts the funded-job notification.',
      fix:
        delivery.selfHires > 0
          ? 'Fund the test from a second wallet. The escrow will not release to a seller that paid itself.'
          : `Answer notify_funded, then submit the deliverable before the deadline. ${KIT}#delivery has both calls.`,
      retest: { kind: 'job-status', label: 'Refresh job status', href: jobsHref },
      proves,
    };
  }
  return {
    id: 'delivered',
    label: 'Funded test job delivered',
    shortName: 'a delivered test job',
    state: 'todo',
    detail: 'No funded job on record.',
    reason: 'Nothing has been paid for, so nothing has been delivered.',
    fix: 'Fund one test job from a wallet that is not the agent’s provider wallet, and let the agent deliver it.',
    retest: { kind: 'hire', label: 'Open the hire flow', href: hireHref },
    proves,
  };
}

function settledMilestone(delivery: ReadinessDelivery, deliveredDone: boolean): ReadinessMilestone {
  const proves =
    'Escrow released and the transaction that released it is on record. This is the end of the path: the agent was paid for work it delivered.';
  if (delivery.settled > 0) {
    return {
      id: 'settled',
      label: 'Settlement confirmed',
      shortName: 'a confirmed settlement',
      state: 'done',
      detail: `${delivery.settled} ${delivery.settled === 1 ? 'job' : 'jobs'} settled, with the releasing transaction on record.`,
      reason: null,
      fix: null,
      retest: null,
      proves,
    };
  }
  if (!deliveredDone) {
    return {
      id: 'settled',
      label: 'Settlement confirmed',
      shortName: 'a confirmed settlement',
      state: 'waiting',
      detail: 'Not attempted: there is nothing delivered for an escrow to release.',
      reason: 'This comes after a delivery. It is not a failed check.',
      fix: null,
      retest: null,
      proves,
    };
  }
  return {
    id: 'settled',
    label: 'Settlement confirmed',
    shortName: 'a confirmed settlement',
    state: 'failed',
    detail: 'Delivered, with no escrow release on record.',
    reason: 'A delivery sits in the dispute window before it settles, and an unsettled job can still expire back to the buyer.',
    fix: 'Wait out the review window, then check the job again. If it expired, the deliverable arrived after the deadline.',
    retest: { kind: 'job-status', label: 'Refresh job status', href: '/build/jobs' },
    proves,
  };
}

/** The first milestone that is not done, or null when all six are. */
export function nextReadinessMilestone(lifecycle?: BuilderLifecycle, context?: { chainId?: number; tokenId?: string }) {
  return builderReadinessMilestones(lifecycle, context).find((milestone) => milestone.state !== 'done') ?? null;
}

export interface ReadinessSummary {
  done: number;
  total: number;
  /** The milestones not yet earned, in order. */
  remaining: ReadinessMilestone[];
  /** What is true of this agent now, in a few words. */
  headline: string;
  /** What is still unproven, said plainly. Empty when nothing is. */
  unproven: string;
}

/** The four that decide whether a buyer can fund a hire at this moment. */
const FUNDABLE_IDS: ReadinessId[] = ['built', 'endpoint', 'identity', 'quote'];

/**
 * What can honestly be said about an agent at this point on the ladder.
 *
 * Written as one function because the claim and the caveat have to be
 * derived together. Eight shipped defects in this repo were a rendered
 * page saying something the code did not support, and the way that
 * happens is a headline computed in one place and a caveat written by
 * hand somewhere else, until one of them stops being true.
 */
export function readinessSummary(milestones: ReadinessMilestone[]): ReadinessSummary {
  const done = milestones.filter((milestone) => milestone.state === 'done');
  const remaining = milestones.filter((milestone) => milestone.state !== 'done');
  const earned = new Set(done.map((milestone) => milestone.id));
  /*
   * The headline is about now, not about the best thing that ever
   * happened.
   *
   * Reading it off the highest milestone earned produced "Delivered and
   * settled" above a list showing the endpoint failing and no payable
   * quote — an agent that delivered once and cannot be hired today,
   * described as finished. Delivery and settlement are historical facts
   * and stay earned; whether a buyer can hire it this minute is a
   * different question, and the headline answers that one.
   */
  const fundableNow = FUNDABLE_IDS.every((id) => earned.has(id));
  const headline = fundableNow
    ? earned.has('settled')
      ? 'Delivered and settled'
      : earned.has('delivered')
        ? 'Delivered, not settled yet'
        : 'A buyer can fund a hire, nothing delivered yet'
    : earned.has('delivered')
      ? 'Delivered before; a buyer cannot hire it now'
      : earned.has('identity')
        ? 'Registered, not yet fundable'
        : earned.has('endpoint')
          ? 'Answering, not registered'
          : earned.has('built')
            ? 'Built, endpoint not checked'
            : 'Nothing observed yet';
  const unprovenLabels = remaining.map((milestone) => milestone.shortName);
  return {
    done: done.length,
    total: milestones.length,
    remaining,
    headline,
    unproven: unprovenLabels.length === 0 ? '' : `Unproven so far: ${unprovenLabels.join(', ')}.`,
  };
}
