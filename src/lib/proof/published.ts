import type { Attestation } from './attestation';

/**
 * One source of truth for evidence that was actually published on-chain.
 *
 * Pokter's own sweep is intentionally represented as an attestation inside the
 * proof engine so every measurement follows the same scoring path. It has no
 * transaction hash, however, and must never leak into copy about independent
 * or published evidence. Likewise, an unnamed publisher is a real receipt but
 * is not proof of an identifiable independent measurer.
 */
export interface PublishedEvidenceSummary {
  attestations: Attestation[];
  total: number;
  scorable: number;
  unscored: number;
  namedMeasurers: string[];
  unattributed: number;
}

export function summarisePublishedEvidence(
  attestations: Attestation[],
): PublishedEvidenceSummary {
  const published = attestations.filter((attestation) =>
    Boolean(attestation.transactionHash),
  );
  const namedMeasurers = [
    ...new Set(
      published
        .map((attestation) => attestation.measuredBy?.trim())
        .filter((measurer): measurer is string => Boolean(measurer)),
    ),
  ];

  const scorable = published.filter(
    (attestation) => attestation.verified && attestation.ratio !== null,
  ).length;

  return {
    attestations: published,
    total: published.length,
    scorable,
    unscored: published.length - scorable,
    namedMeasurers,
    unattributed: published.filter(
      (attestation) => !attestation.measuredBy?.trim(),
    ).length,
  };
}

export function publishedEvidenceLine(
  summary: PublishedEvidenceSummary,
): string {
  if (summary.total === 0) return 'No on-chain attestations published';

  const receipt = `${summary.total} on-chain ${summary.total === 1 ? 'attestation' : 'attestations'}`;
  if (summary.namedMeasurers.length === 0) {
    return `${receipt}; no named independent measurer`;
  }

  const named = `${summary.namedMeasurers.length} named ${
    summary.namedMeasurers.length === 1 ? 'measurer' : 'measurers'
  }`;
  const unattributed = summary.unattributed
    ? `; ${summary.unattributed} ${
        summary.unattributed === 1 ? 'receipt is' : 'receipts are'
      } unattributed`
    : '';

  return `${receipt} from ${named}${unattributed}`;
}
