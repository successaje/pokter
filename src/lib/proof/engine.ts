import type { Attestation } from './attestation';

/**
 * The marketplace's central judgement about an agent.
 *
 * The rule the whole product is built around: an agent you cannot verify is not
 * a low-scoring agent, it is an *unproven* one. We never synthesise a number to
 * fill an empty card; unproven and failing agents take an explicit risk path.
 */
/**
 * What Pokter knows about an agent, as a lifecycle rather than a grade.
 *
 * `unproven` used to carry two different meanings: "nobody has checked this"
 * and "this was checked and fell short". Those are opposite claims, and a
 * newly registered agent wearing the same word as a thin one reads as an
 * accusation about the agent when it is a statement about our own ignorance.
 *
 * `observed` splits them on a bar the product already enforces. The proven bar
 * has two unrelated kinds of shortfall — how much Pokter has looked (probes,
 * window, score) and whether anyone independent has looked at all (measurers).
 * An agent below the first has barely been examined; one above it but short of
 * the second has been examined properly and simply has no corroboration. The
 * old vocabulary called both "emerging" and told a reader nothing.
 */
export type Verdict =
  | 'proven'
  | 'emerging'
  | 'observed'
  | 'failing'
  | 'unproven';

export interface ProofSummary {
  verdict: Verdict;
  /** 0..1 confidence-weighted performance, or null when unproven. */
  score: number | null;
  /** Attestations that decoded cleanly and carry a usable value. */
  usableCount: number;
  /** Total attestations seen, including undecodable ones. */
  totalCount: number;
  /** Distinct independent measurers — one measurer is a weaker claim than three. */
  measurers: string[];
  /** Longest measurement window observed, in days. */
  windowDays: number | null;
  /** Total probes across all attestations: the raw evidence volume. */
  probes: number;
  /** Defects the measurers themselves disclosed, de-duplicated. */
  disclosedDefects: string[];
  /** Plain-language explanation of how this verdict was reached. */
  rationale: string;
  /** Whether Pokter recommends the normal, low-friction hire path. */
  recommendedForHire: boolean;
}

/**
 * Minimum evidence before we will call anything "proven".
 *
 * The bar is independence, not row count. Counting attestation rows made
 * "proven" unreachable in practice: scheduled sweeps accumulate probes but
 * aggregate into a single first-party attestation, so an agent watched for
 * months by two measurers would still have been capped at "emerging". What
 * matters is that more than one party checked it, over enough probes, across
 * more than a single instant.
 */
export const PROVEN_MIN_PROBES = 40;
export const PROVEN_MIN_MEASURERS = 2;
export const PROVEN_MIN_WINDOW_DAYS = 1;
export const PROVEN_MIN_SCORE = 0.9;
export const FAILING_MAX_SCORE = 0.5;

/**
 * Weight an attestation by how much evidence backs it. A 72-probe reading is
 * worth more than a 5-probe one, but with diminishing returns so a single
 * high-volume measurer cannot drown out the rest.
 */
/** `1 probe`, `2 probes`. Cheaper than reading `probe(s)` forever. */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function evidenceWeight(attestation: Attestation): number {
  const probes = attestation.method?.probes ?? 1;
  return Math.log10(Math.max(1, probes) + 1) + 0.1;
}

function unique(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

export function summariseProof(attestations: Attestation[]): ProofSummary {
  const usable = attestations.filter((a) => a.verified && a.ratio !== null);
  const published = attestations.filter((a) => a.transactionHash);
  const measurers = unique(published.map((a) => a.measuredBy)).filter(
    (measurer) => measurer.toLowerCase() !== 'pokter',
  );
  const disclosedDefects = unique(
    attestations.flatMap((a) => a.method?.knownDefects ?? []),
  );
  const probes = attestations.reduce(
    (sum, a) => sum + (a.method?.probes ?? 0),
    0,
  );
  const windowDays = attestations.reduce<number | null>((longest, a) => {
    const window = a.method?.windowDays;
    if (typeof window !== 'number') return longest;
    return longest === null ? window : Math.max(longest, window);
  }, null);

  const base = {
    usableCount: usable.length,
    totalCount: attestations.length,
    measurers,
    windowDays,
    probes,
    disclosedDefects,
  };

  if (usable.length === 0) {
    return {
      ...base,
      verdict: 'unproven',
      score: null,
      recommendedForHire: false,
      rationale:
        attestations.length === 0
          ? 'No on-chain attestations exist for this agent. There is nothing to verify, so Pokter does not recommend hiring it.'
          : `${plural(attestations.length, 'attestation')} exist but none decoded into a readable measurement, so Pokter cannot recommend this agent.`,
    };
  }

  const totalWeight = usable.reduce((sum, a) => sum + evidenceWeight(a), 0);
  const score =
    usable.reduce((sum, a) => sum + (a.ratio as number) * evidenceWeight(a), 0) /
    totalWeight;

  /*
   * How much Pokter has looked — not how well the agent did.
   *
   * This bar originally included the score, which made `observed` claim
   * something false. An agent probed 286 times over 28 days and answering
   * 88.8% of them was badged "measurement has started, too few probes or too
   * short a window to judge yet", when it had been examined thoroughly and
   * simply was not excellent. Eight of the nine observed agents in production
   * were that case.
   *
   * Coverage and quality are different questions. Coverage decides whether
   * Pokter is entitled to an opinion at all; quality decides which opinion.
   */
  const examined =
    probes >= PROVEN_MIN_PROBES &&
    (windowDays ?? 0) >= PROVEN_MIN_WINDOW_DAYS;

  const verdict: Verdict =
    score < FAILING_MAX_SCORE
      ? 'failing'
      : !examined
        ? 'observed'
        : score >= PROVEN_MIN_SCORE &&
            measurers.length >= PROVEN_MIN_MEASURERS
          ? 'proven'
          : 'emerging';

  /*
   * FE-12. The probe count is the sum across every measurer, while the agent
   * page separately shows Pokter's own. Two different probe totals sat on one
   * screen with nothing saying whose each was, which is corrosive on a page
   * whose argument is that its numbers can be trusted. Naming the scope costs
   * three words.
   *
   * The attestation count had the same fault and a worse consequence. Pokter's
   * own sweep enters this function as a synthetic attestation so that first-
   * and third-party evidence run through one verdict path — but it carries no
   * transaction hash, and `toSweepAttestation` is explicit that the interface
   * must not mix it in with the published ones.
   *
   * Counting them together produced a sentence that was not merely inconsistent
   * with the trust strip but wrong about who had checked: one listed agent has
   * three published attestations, none of them scorable, and a score resting
   * entirely on Pokter's own probing. "Across 1 of 4 attestations" presented
   * that as attested evidence. It is not — it is us, marking our own homework,
   * and the sentence now says so before anything else.
   */
  const usablePublished = usable.filter((a) => a.transactionHash);
  const selfMeasured = usable.some((a) => !a.transactionHash);
  const ownProbeCount = attestations
    .filter((a) => !a.transactionHash)
    .reduce((sum, a) => sum + (a.method?.probes ?? 0), 0);

  const unscored =
    published.length > usablePublished.length
      ? ` ${plural(published.length - usablePublished.length, 'published attestation')} could not be scored.`
      : '';

  /*
   * FE-16 in passing: `attestation(s)` reads like a form field, so the counts
   * pluralise properly.
   */
  const ownProbes = `${plural(ownProbeCount, 'probe')} by Pokter`;
  const span = windowDays ? `, over ${plural(windowDays, 'day')}` : '';

  const evidence =
    usablePublished.length === 0
      ? `${ownProbes} and nothing else${span}.${unscored}`
      : selfMeasured
        ? `${plural(usablePublished.length, 'published attestation')} and ${ownProbes}${span}.${unscored}`
        : `${plural(usablePublished.length, 'published attestation')}${span}.${unscored}`;

  /** What is still missing before this could be called proven. */
  const shortfalls = [
    probes < PROVEN_MIN_PROBES &&
      `${plural(PROVEN_MIN_PROBES - probes, 'more probe')}`,
    /*
     * "A second independent measurer" counts Pokter as the first, which it is
     * not — an agent whose only measurer is us has no independent check at
     * all, and telling its buyer they need a *second* one implies otherwise.
     *
     * Kept to a parenthetical rather than a dashed clause: this is one item in
     * a comma-separated list of shortfalls, and a dash here ran the sentence
     * into whichever shortfall followed it.
     */
    measurers.length < PROVEN_MIN_MEASURERS &&
      (measurers.length === 0
        ? selfMeasured
          ? 'two independent measurers (only Pokter has checked)'
          : 'two independent measurers'
        : 'a second independent measurer'),
    (windowDays ?? 0) < PROVEN_MIN_WINDOW_DAYS &&
      'at least a day of observation',
    score < PROVEN_MIN_SCORE && `a score above ${PROVEN_MIN_SCORE * 100}%`,
  ].filter((s): s is string => Boolean(s));

  const rationale =
    verdict === 'failing'
      ? `Measured at ${(score * 100).toFixed(1)}% from ${evidence} This agent is failing its own measurers, so Pokter does not recommend hiring it.`
      : verdict === 'proven'
        ? `Measured at ${(score * 100).toFixed(1)}% from ${evidence} Enough independent evidence to clear the proven bar.`
        : `Measured at ${(score * 100).toFixed(1)}% from ${evidence} Real, but not yet proven — that needs ${shortfalls.join(', ')}.`;

  return {
    ...base,
    verdict,
    score,
    /*
     * The risk-acceptance path is for an agent the evidence argues against or
     * cannot speak to at all: `failing`, and `unproven` above.
     *
     * `observed` belongs on the normal path. This rule predates that tier and
     * read `proven || emerging`, which was correct when `emerging` still
     * covered thin records — the note here said so, that an agent with a thin
     * record may use the normal path with the thinness surfaced in the UI.
     * Splitting `observed` out of `emerging` moved exactly that case into a
     * tier this line had never heard of, so an agent answering every probe it
     * had been given was told it required explicit risk acceptance. The thin
     * record is still shown: the badge says Observed and the page states the
     * probe count and window.
     */
    recommendedForHire:
      verdict === 'proven' || verdict === 'emerging' || verdict === 'observed',
    rationale,
  };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  proven: 'Proven',
  emerging: 'Emerging',
  observed: 'Observed',
  failing: 'Failing',
  /*
   * Named for what Pokter lacks rather than for what the agent failed to be.
   * "Unproven" reads as a verdict on the agent; this state is a verdict on our
   * own coverage, and an agent registered an hour ago has done nothing wrong.
   */
  unproven: 'Not measured',
};

/** One line on what each state means, for anywhere the badge needs explaining. */
export const VERDICT_MEANING: Record<Verdict, string> = {
  proven: 'Independent measurers agree, over enough probes and a long enough window.',
  emerging: 'Measured well enough to judge, but nobody independent has corroborated it.',
  observed: 'Measurement has started. Too few probes, or too short a window, to judge yet.',
  failing: 'Measured, and failing its own measurers.',
  unproven: 'Nothing has been measured. This says what Pokter lacks, not what the agent did.',
};
