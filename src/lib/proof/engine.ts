import type { Attestation } from './attestation';

/**
 * The marketplace's central judgement about an agent.
 *
 * The rule the whole product is built around: an agent you cannot verify is not
 * a low-scoring agent, it is an *unproven* one. We never synthesise a number to
 * fill an empty card; unproven and failing agents take an explicit risk path.
 */
export type Verdict = 'proven' | 'emerging' | 'failing' | 'unproven';

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

  const measurers = unique(attestations.map((a) => a.measuredBy));
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

  const verdict: Verdict =
    score < FAILING_MAX_SCORE
      ? 'failing'
      : score >= PROVEN_MIN_SCORE &&
          probes >= PROVEN_MIN_PROBES &&
          measurers.length >= PROVEN_MIN_MEASURERS &&
          (windowDays ?? 0) >= PROVEN_MIN_WINDOW_DAYS
        ? 'proven'
        : 'emerging';

  /*
   * FE-12. This count is the sum across every measurer, while the agent page
   * separately shows Pokter's own. Two different probe totals sat on one
   * screen with nothing saying whose each was, which is corrosive on a page
   * whose argument is that its numbers can be trusted. Naming the scope costs
   * three words.
   *
   * The same fault, worse, in the attestation count: this sentence counted
   * only the attestations that decoded and carried a ratio, while the trust
   * strip beside it counted every attestation received. One screen said "1
   * attestation" and "Attestations 3" about the same agent, and a page whose
   * entire argument is that it does not invent numbers cannot contradict
   * itself in two adjacent paragraphs.
   *
   * Saying "1 of 3" fixes it and pays for itself: it reports that two
   * attestations exist which could not be scored, which is a fact a buyer
   * should have and the old phrasing hid.
   *
   * The measurer clause merged into the probe clause. "286 probes across all
   * measurers, 1 measurer" said the scope twice and scanned as a stutter.
   *
   * FE-16 in passing: `attestation(s)` reads like a form field, so the counts
   * pluralise properly.
   */
  const scored =
    usable.length === attestations.length
      ? plural(usable.length, 'attestation')
      : `${usable.length} of ${plural(attestations.length, 'attestation')}`;

  const evidence =
    `${scored}, ` +
    `${plural(probes, 'probe')} ` +
    `${measurers.length ? `from ${plural(measurers.length, 'measurer')}` : 'from no named measurer'}` +
    (windowDays ? `, over ${plural(windowDays, 'day')}` : '');

  /** What is still missing before this could be called proven. */
  const shortfalls = [
    probes < PROVEN_MIN_PROBES &&
      `${plural(PROVEN_MIN_PROBES - probes, 'more probe')}`,
    measurers.length < PROVEN_MIN_MEASURERS &&
      'a second independent measurer',
    (windowDays ?? 0) < PROVEN_MIN_WINDOW_DAYS &&
      'at least a day of observation',
    score < PROVEN_MIN_SCORE && `a score above ${PROVEN_MIN_SCORE * 100}%`,
  ].filter((s): s is string => Boolean(s));

  const rationale =
    verdict === 'failing'
      ? `Measured at ${(score * 100).toFixed(1)}% across ${evidence}. This agent is failing its own measurers, so Pokter does not recommend hiring it.`
      : verdict === 'proven'
        ? `Measured at ${(score * 100).toFixed(1)}% across ${evidence} — enough independent evidence to clear the proven bar.`
        : `Measured at ${(score * 100).toFixed(1)}% across ${evidence}. Real, but not yet proven — that needs ${shortfalls.join(', ')}.`;

  return {
    ...base,
    verdict,
    score,
    // A failing agent takes the explicit risk-acceptance path; an emerging one
    // may use the normal path, with its thin record still surfaced in the UI.
    recommendedForHire: verdict === 'proven' || verdict === 'emerging',
    rationale,
  };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  proven: 'Proven',
  emerging: 'Emerging',
  failing: 'Failing',
  unproven: 'Unproven',
};
