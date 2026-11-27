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
/** Unscored receipts that lack the same fields, counted together. */
export interface AttestationGapGroup {
  /** Schema field names, as `attestationGaps` returns them. */
  fields: string[];
  count: number;
}

export interface PublishedEvidenceSummary {
  attestations: Attestation[];
  total: number;
  scorable: number;
  unscored: number;
  independentAuthors: string[];
  undeterminedAuthors: number;
  /**
   * Why the unscored ones were refused, commonest first. A measurer who
   * publishes and sees nothing change has no way to tell whether the receipt
   * was missed or rejected, so the page says which field it was.
   */
  gaps: AttestationGapGroup[];
}

function groupGaps(unscored: Attestation[]): AttestationGapGroup[] {
  const groups = new Map<string, AttestationGapGroup>();
  for (const attestation of unscored) {
    if (attestation.missing.length === 0) continue;
    const key = attestation.missing.join(',');
    const seen = groups.get(key);
    if (seen) seen.count += 1;
    else groups.set(key, { fields: attestation.missing, count: 1 });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.fields.length - b.fields.length);
}

export function summarisePublishedEvidence(
  attestations: Attestation[],
): PublishedEvidenceSummary {
  const published = attestations.filter((attestation) =>
    Boolean(attestation.transactionHash),
  );
  const independentAuthors = [
    ...new Set(
      published
        .filter((attestation) => attestation.independence === 'independent')
        .map((attestation) => attestation.authorAddress?.trim())
        .filter((measurer): measurer is string => Boolean(measurer)),
    ),
  ];

  const unscored = published.filter(
    (attestation) => !(attestation.verified && attestation.ratio !== null),
  );
  const scorable = published.length - unscored.length;

  return {
    attestations: published,
    total: published.length,
    scorable,
    unscored: unscored.length,
    gaps: groupGaps(unscored),
    independentAuthors,
    undeterminedAuthors: published.filter((attestation) => attestation.independence === 'undetermined').length,
  };
}

export function publishedEvidenceLine(
  summary: PublishedEvidenceSummary,
): string {
  if (summary.total === 0) return 'No on-chain attestations published';

  const receipt = `${summary.total} on-chain ${summary.total === 1 ? 'attestation' : 'attestations'}`;
  if (summary.independentAuthors.length === 0) {
    return `${receipt}; no independently verified author wallet`;
  }

  const named = `${summary.independentAuthors.length} independent author ${
    summary.independentAuthors.length === 1 ? 'wallet' : 'wallets'
  }`;
  const unattributed = summary.undeterminedAuthors
    ? `; ${summary.undeterminedAuthors} ${
        summary.undeterminedAuthors === 1 ? 'author is' : 'authors are'
      } undetermined`
    : '';

  return `${receipt} from ${named}${unattributed}`;
}
