import type { Category } from '@/lib/agents/categories';

/**
 * The Pokter Score: an operational track record, and nothing more.
 *
 * What the marketplace can actually measure was counted before this was
 * designed, across all 173 listed agents:
 *
 *   probe answer rate      109 agents (108 with 50+ checks)  Pokter-measured
 *   paid-job delivery       47 agents with a resolved job    on chain
 *   external settlement     13 agents                        on chain
 *   attestations            45 agents, mostly unverified     on chain
 *   correctness grades      one vertical, a handful of runs  Pokter-measured
 *   realised returns         0 agents                        nobody publishes it
 *
 * Only the first two are broad enough to rank on, and both answer the same
 * narrow question: did the agent do the thing it was asked to do. So that
 * is what the score says, and the name of every component says it too.
 *
 * It is NOT a quality rating. It does not measure whether an answer was
 * correct, useful or profitable, because the evidence for that covers one
 * vertical and a handful of runs. It is NOT a demand rating: 13 agents in
 * the whole marketplace have an externally funded settlement, which is too
 * few to order, and most paid work here was funded by Pokter. And it is not
 * a statement that an agent can be hired right now — see `hireable` on the
 * agent, which is a different question with a different answer.
 */
export const SCORE_VERSION = '2.0.0';

/**
 * Two components, both required, fixed weights.
 *
 * Required is what makes the weights honest. A component an agent lacks is
 * never redistributed across the others — redistribution is how an agent
 * measured on one thing comes to outrank one measured on three — so instead
 * the minimum-evidence rule below refuses to score an agent that is missing
 * either. Every ranked agent is therefore scored on exactly the same two
 * things, out of the same 100.
 *
 * 60/40 rather than 50/50 because delivery is the scarcer and more costly
 * signal: a check is free to answer and a paid job is not. The split is
 * also close to irrelevant, which is the strongest argument for it — see
 * `tests/score-track-record.test.mts`, where moving it to 50/50, 70/30,
 * 40/60 or 80/20 changes at most two positions in the top ten, by one
 * place. The order is produced by the evidence, not by these numbers.
 */
export const COMPONENT_WEIGHTS = { delivery: 60, responsiveness: 40 } as const;
export type ComponentId = keyof typeof COMPONENT_WEIGHTS;

export const COMPONENT_LABELS: Record<ComponentId, string> = {
  delivery: 'Delivered what it was paid for',
  responsiveness: 'Answered Pokter’s checks',
};

/**
 * The minimum evidence to be ranked at all.
 *
 * Below it an agent is unranked and says "Not enough evidence", which is a
 * different statement from a low score and must never be shown as one. A
 * nought here would assert that the agent failed, when the fact is that
 * nobody has asked it to do anything yet.
 *
 * One resolved job is enough because the shrinkage below already stops a
 * single success from dominating: 1 of 1 earns 0.207 of the delivery
 * component where 13 of 13 earns 0.772. Requiring three would be a second,
 * blunter instrument doing a job the first already does better, and would
 * cut the ranked field from 41 agents to 17.
 */
export const MIN_CHECKS = 50;
export const MIN_RESOLVED_JOBS = 1;

export interface TrackRecordInputs {
  /** Paid escrow jobs this agent delivered. Self-hires excluded upstream. */
  delivered: number;
  /**
   * Paid escrow jobs that reached their deadline undelivered.
   *
   * A funded job inside its deadline is pending, not missed, and belongs in
   * neither number: counting it as a failure would mark an agent down for
   * work it still has time to do.
   */
  missed: number;
  answered: number;
  checks: number;
  /** How much of the window the checks actually span. Reported, not scored. */
  observedDays: number | null;
  category: Category | 'unclassified';
}

/**
 * The lower bound of a Wilson score interval at 95%.
 *
 * This is the whole small-sample defence, and it is doing real work on this
 * data: 32 of the 47 agents with a resolved job have delivered every one of
 * them, so a raw rate puts a 1-of-1 agent level with a 13-of-13 agent and
 * then breaks the tie on something arbitrary. Ordering on the lower bound
 * instead asks how little the evidence would still support, which is the
 * question a buyer is actually asking.
 *
 * Used for ordering only. The honest rate is still printed beside it, and
 * the sample it came from is printed too.
 */
export function wilsonLowerBound(successes: number, trials: number, z = 1.96): number | null {
  if (trials <= 0 || successes < 0 || successes > trials) return null;
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = p + (z * z) / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials));
  return Math.max(0, (centre - margin) / denominator);
}

/**
 * How much evidence is behind a score, kept outside the score.
 *
 * Deliberately not called confidence: it is not a calibrated interval and
 * nothing here converts it into a probability. It is a plain reading of two
 * sample sizes, so a reader can tell a score built on 13 jobs from one built
 * on 1 without the score itself pretending the difference away.
 *
 * Bands come from the observed distribution rather than round numbers: the
 * largest resolved-job count in the marketplace is 13, so 8+ is the top band
 * and 3-7 the middle; checks cluster near 270-370, so 300+ is the top band.
 */
export type EvidenceStrength = 'limited' | 'moderate' | 'strong';

export function evidenceStrength(input: { resolved: number; checks: number }): EvidenceStrength {
  const jobs: EvidenceStrength = input.resolved >= 8 ? 'strong' : input.resolved >= 3 ? 'moderate' : 'limited';
  const probes: EvidenceStrength = input.checks >= 300 ? 'strong' : input.checks >= 150 ? 'moderate' : 'limited';
  /* The weaker of the two, because a score is only as well evidenced as its
     thinnest component and the delivery side is always the thinner one. */
  const order: EvidenceStrength[] = ['limited', 'moderate', 'strong'];
  return order[Math.min(order.indexOf(jobs), order.indexOf(probes))];
}

export interface ScoreComponent {
  id: ComponentId;
  label: string;
  weight: number;
  /** Points earned out of `weight`. */
  earned: number;
  /** The plain rate a reader would check this against. */
  rate: number;
  /** The sample it came from, as "13 of 13". */
  sample: string;
}

export type UnrankedReason = 'no-checks' | 'too-few-checks' | 'no-resolved-jobs';

export interface TrackRecord {
  /** 0..100, or null when the minimum evidence is not met. */
  overall: number | null;
  rankable: boolean;
  unrankedReason: UnrankedReason | null;
  components: ScoreComponent[];
  evidence: EvidenceStrength;
  /** Resolved paid jobs behind the delivery component. */
  resolvedJobs: number;
  delivered: number;
  checks: number;
  answered: number;
  observedDays: number | null;
  category: Category | 'unclassified';
  version: string;
  calculatedAt: string;
}

export function scoreTrackRecord(input: TrackRecordInputs, now: Date = new Date()): TrackRecord {
  const resolved = input.delivered + input.missed;
  const base = {
    resolvedJobs: resolved,
    delivered: input.delivered,
    checks: input.checks,
    answered: input.answered,
    observedDays: input.observedDays,
    category: input.category,
    version: SCORE_VERSION,
    calculatedAt: now.toISOString(),
    evidence: evidenceStrength({ resolved, checks: input.checks }),
  };

  const unranked = (unrankedReason: UnrankedReason): TrackRecord => ({
    ...base,
    overall: null,
    rankable: false,
    unrankedReason,
    components: [],
  });

  if (input.checks <= 0) return unranked('no-checks');
  if (input.checks < MIN_CHECKS) return unranked('too-few-checks');
  if (resolved < MIN_RESOLVED_JOBS) return unranked('no-resolved-jobs');

  const deliveryBound = wilsonLowerBound(input.delivered, resolved) ?? 0;
  const answerBound = wilsonLowerBound(input.answered, input.checks) ?? 0;
  const components: ScoreComponent[] = [
    {
      id: 'delivery',
      label: COMPONENT_LABELS.delivery,
      weight: COMPONENT_WEIGHTS.delivery,
      earned: COMPONENT_WEIGHTS.delivery * deliveryBound,
      rate: input.delivered / resolved,
      sample: `${input.delivered} of ${resolved}`,
    },
    {
      id: 'responsiveness',
      label: COMPONENT_LABELS.responsiveness,
      weight: COMPONENT_WEIGHTS.responsiveness,
      earned: COMPONENT_WEIGHTS.responsiveness * answerBound,
      rate: input.answered / input.checks,
      sample: `${input.answered} of ${input.checks}`,
    },
  ];

  return {
    ...base,
    /* Out of the fixed 100, never rescaled: both components are required,
       so there is never a missing weight to redistribute. */
    overall: components.reduce((sum, component) => sum + component.earned, 0),
    rankable: true,
    unrankedReason: null,
    components,
  };
}

/**
 * The published order, and the only one.
 *
 * Ranked inside a category, because an answer rate and a delivery count mean
 * different things for a grid trader and a health-factor monitor, and a
 * single table across them would invite one category's typical figure to be
 * read as the standard for another.
 *
 * Every tie-break is a stated fact about the evidence rather than a second
 * hidden metric, and the last of them is the name, so the order is total and
 * two runs over the same data cannot disagree.
 */
export function rankTrackRecords<T extends { score: TrackRecord; name: string }>(rows: readonly T[]): T[] {
  return rows
    .filter((row) => row.score.rankable)
    .slice()
    .sort(
      (a, b) =>
        (b.score.overall ?? 0) - (a.score.overall ?? 0) ||
        b.score.resolvedJobs - a.score.resolvedJobs ||
        b.score.checks - a.score.checks ||
        a.name.localeCompare(b.name),
    );
}

/** What the board says instead of a number, and why. */
export const UNRANKED_COPY: Record<UnrankedReason, string> = {
  'no-checks': 'Not enough evidence — Pokter has no check recorded for this agent in the window.',
  'too-few-checks': `Not enough evidence — fewer than ${MIN_CHECKS} checks in the window.`,
  'no-resolved-jobs': 'Not enough evidence — no paid job has reached delivery or its deadline yet.',
};

/**
 * The limits, published with the score rather than filed behind it.
 *
 * The first one is the one that matters most and is the least flattering:
 * Pokter funded 124 of the 163 jobs in its own index, so the agents with the
 * longest delivery records are largely the ones Pokter chose to hire, and
 * several of them are Pokter's own. The score reports that record honestly;
 * it does not claim the record was earned in an open market.
 */
export const SCORE_LIMITS: readonly string[] = [
  'Most paid work in Pokter’s index was funded by Pokter. A long delivery record here means Pokter hired that agent often and it delivered, not that buyers chose it.',
  'It measures whether work was delivered and checks were answered. It does not measure whether an answer was correct, useful or profitable.',
  'Answering a check is a protocol handshake. An agent can answer every one and still be unable to do the work.',
  'Testnet and mainnet evidence are counted the same way and the network is shown on every row. Amounts are never added across networks.',
  'Self-hires are excluded from the delivery record. Pokter cannot prove that two wallets are unrelated, so a determined operator could still fund their own agent from a second wallet.',
  'A score is a record of the past. Whether an agent can be hired now is a separate question, answered separately on its page.',
];
