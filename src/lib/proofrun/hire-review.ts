import type { AcceptanceSpec } from '@/lib/shared/contracts';
import { SPEC_TERM_PREFIX } from './versions';

/** A review may claim agreement only for the exact spec line in the signed quote. */
export function hireReviewBinding(
  spec: AcceptanceSpec,
  quote: { criteriaBinding: AcceptanceSpec['binding'] | null; anchor?: Record<string, unknown> } | null,
): AcceptanceSpec['binding'] {
  const terms = quote?.anchor?.terms;
  const criteria = terms && typeof terms === 'object' && !Array.isArray(terms)
    ? (terms as { success_criteria?: unknown }).success_criteria
    : null;
  if (quote?.criteriaBinding?.kind === 'signed-terms'
    && Array.isArray(criteria)
    && criteria.includes(`${SPEC_TERM_PREFIX}${spec.specHash}`)) {
    return quote.criteriaBinding;
  }
  return { kind: 'pokter-asserted' };
}
