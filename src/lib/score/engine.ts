import type { Attestation } from '@/lib/proof/attestation';
import type { ProofSummary } from '@/lib/proof/engine';
import type { TrackRecord } from '@/lib/history/record';
import type { LiveReading } from '@/lib/proof/prober';
import type { ScanAgentDetail } from '@/lib/scan/types';
import type { Category } from '@/lib/agents/categories';
import {
  DIMENSION_WEIGHTS,
  SCORE_VERSION,
  type Dimension,
  type DimensionScore,
  type PokterScore,
} from './types';

/**
 * Inputs the score is allowed to see. Everything here is either read from chain,
 * measured by Pokter, or published by the agent itself — there is no third
 * category, and nothing is inferred to fill a gap.
 */
export interface ScoreInputs {
  agent: ScanAgentDetail;
  category: Category | 'unclassified';
  proof: ProofSummary;
  attestations: Attestation[];
  record: TrackRecord;
  live: LiveReading;
}

function unmeasured(
  dimension: Dimension,
  explanation: string,
  inputs: { label: string; value: string }[] = [],
): DimensionScore {
  return {
    dimension,
    earned: null,
    weight: DIMENSION_WEIGHTS[dimension],
    explanation,
    inputs,
  };
}

/**
 * Reliability: does it answer when called?
 *
 * Built from probe history plus the live reading. Uptime alone is not enough —
 * a single long blackout matters more to someone holding a leveraged position
 * than the same downtime spread thinly, so a sustained outage is penalised
 * beyond its effect on the average.
 */
function scoreReliability({ record, live }: ScoreInputs): DimensionScore {
  const weight = DIMENSION_WEIGHTS.reliability;
  const observed = record.totalProbes;

  if (observed === 0 && live.protocol === 'none') {
    return unmeasured(
      'reliability',
      'This agent publishes no endpoint we can reach, so its reliability has never been observed.',
    );
  }

  if (observed === 0) {
    return unmeasured(
      'reliability',
      'Pokter has not yet accumulated probe history for this agent. The live check above is a single sample, which is not a reliability measurement.',
      [{ label: 'Live probe', value: `${live.answered}/${live.probes.length} answered` }],
    );
  }

  const uptime = record.totalAnswered / record.totalProbes;

  // A run of consecutive failures is the shape of a real outage. Scale the
  // penalty by how much of the observed history it consumed.
  const outageShare = record.longestOutage
    ? record.longestOutage.probes / record.totalProbes
    : 0;
  const outagePenalty = Math.min(0.35, outageShare * 0.7);

  const earned = Math.max(0, weight * (uptime - outagePenalty));

  return {
    dimension: 'reliability',
    earned,
    weight,
    explanation:
      `Answered ${record.totalAnswered} of ${record.totalProbes} probes Pokter has taken. ` +
      (record.longestOutage
        ? `Reduced for a sustained outage of ${record.longestOutage.probes} consecutive failed probes.`
        : 'No sustained outage observed.'),
    inputs: [
      { label: 'Probes answered', value: `${record.totalAnswered}/${record.totalProbes}` },
      { label: 'Uptime', value: `${(uptime * 100).toFixed(1)}%` },
      {
        label: 'Longest outage',
        value: record.longestOutage
          ? `${record.longestOutage.probes} consecutive failures`
          : 'none observed',
      },
    ],
  };
}

/**
 * Evidence: how much independent checking has this agent survived?
 *
 * Deliberately rewards independence over volume. One measurer running thousands
 * of probes is a weaker claim than three measurers agreeing, because a single
 * measurer's blind spots go uncorrected.
 */
function scoreEvidence({ proof, record }: ScoreInputs): DimensionScore {
  const weight = DIMENSION_WEIGHTS.evidence;

  if (proof.totalCount === 0 && record.totalProbes === 0) {
    return {
      dimension: 'evidence',
      earned: 0,
      weight,
      explanation:
        'No attestation exists and Pokter has never measured this agent. There is nothing to verify.',
      inputs: [{ label: 'Attestations', value: '0' }],
    };
  }

  const measurerCount = proof.measurers.length;
  const independence = Math.min(1, measurerCount / 3);
  const volume = Math.min(1, proof.probes / 200);
  const duration = Math.min(1, (proof.windowDays ?? 0) / 30);

  // Independence is weighted hardest: it is the part that cannot be gamed by
  // simply probing more often.
  const earned = weight * (independence * 0.5 + volume * 0.3 + duration * 0.2);

  return {
    dimension: 'evidence',
    earned,
    weight,
    explanation:
      `${measurerCount || 'No'} independent measurer(s), ${proof.probes} probe(s), ` +
      `over ${proof.windowDays ?? 0} day(s) of observation. Independence is weighted most heavily, ` +
      'because probing more often does not make a single measurer more trustworthy.',
    inputs: [
      { label: 'Measurers', value: measurerCount ? proof.measurers.join(', ') : 'none' },
      { label: 'Attestations', value: String(proof.totalCount) },
      { label: 'Probes', value: String(proof.probes) },
      { label: 'Observed window', value: `${proof.windowDays ?? 0} day(s)` },
    ],
  };
}

/**
 * Efficiency: responsiveness of the service.
 *
 * Latency is a genuine signal for a health-factor agent, where being slow and
 * being wrong converge, but it is only a proxy for gas or capital efficiency —
 * which we cannot see and therefore do not claim.
 */
function scoreEfficiency({ record }: ScoreInputs): DimensionScore {
  const weight = DIMENSION_WEIGHTS.efficiency;

  const window = [...record.windows].reverse().find((w) => w.medianMs !== null);
  const medianMs = window?.medianMs ?? null;

  if (medianMs === null) {
    return unmeasured(
      'efficiency',
      'No successful response has been timed, so there is no latency to score.',
    );
  }

  // Full marks under 250ms, tapering to zero at 5s. Beyond that an agent is not
  // meaningfully responsive for an automated strategy.
  const normalised =
    medianMs <= 250 ? 1 : medianMs >= 5000 ? 0 : 1 - (medianMs - 250) / 4750;

  return {
    dimension: 'efficiency',
    earned: weight * normalised,
    weight,
    explanation:
      `Median response of ${medianMs}ms across ${window?.probes ?? 0} probe(s). ` +
      'This measures service responsiveness only — gas and capital efficiency are not published by the registry and are not scored.',
    inputs: [
      { label: 'Median response', value: `${medianMs}ms` },
      { label: 'Window', value: window?.label ?? '—' },
    ],
  };
}

/**
 * Performance and risk require realised returns and drawdown. The registry
 * publishes neither, and no measurer currently attests to them, so both are
 * reported as unmeasured rather than approximated from something else.
 */
function scorePerformance(): DimensionScore {
  return unmeasured(
    'performance',
    'Realised returns are not published by the registry and no measurer attests to them. Pokter does not estimate performance from unrelated signals.',
  );
}

function scoreRisk(): DimensionScore {
  return unmeasured(
    'risk',
    'Drawdown and volatility require a position history that is not available for this agent. Pokter does not infer risk from uptime.',
  );
}

/**
 * Compute the Pokter Score.
 *
 * The overall figure is rescaled across the dimensions that carried data, so an
 * agent is never punished for a dimension nobody can measure — but `coverage`
 * travels with the score everywhere it is displayed, so a 90 measured on three
 * dimensions never passes for a 90 measured on five.
 */
export function computeScore(inputs: ScoreInputs): PokterScore {
  const dimensions: DimensionScore[] = [
    scorePerformance(),
    scoreReliability(inputs),
    scoreEvidence(inputs),
    scoreRisk(),
    scoreEfficiency(inputs),
  ];

  const measured = dimensions.filter((d) => d.earned !== null);
  const availableWeight = measured.reduce((sum, d) => sum + d.weight, 0);
  const earnedPoints = measured.reduce((sum, d) => sum + (d.earned as number), 0);

  return {
    overall: availableWeight === 0 ? null : (earnedPoints / availableWeight) * 100,
    dimensions,
    measuredDimensions: measured.length,
    totalDimensions: dimensions.length,
    coverage:
      availableWeight /
      Object.values(DIMENSION_WEIGHTS).reduce((sum, w) => sum + w, 0),
    category: inputs.category,
    version: SCORE_VERSION,
    calculatedAt: new Date().toISOString(),
  };
}
