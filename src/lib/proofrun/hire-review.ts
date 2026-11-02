import type { AcceptanceSpec } from '@/lib/shared/contracts';
import { SPEC_TERM_PREFIX } from './versions';

/** A review may claim agreement only for the exact spec line in the signed quote. */
export function hireReviewBinding(
  spec: Pick<AcceptanceSpec, 'specHash'>,
  quote: { criteriaBinding: AcceptanceSpec['binding'] | null; anchor?: Record<string, unknown> } | null,
  termPrefix = SPEC_TERM_PREFIX,
): AcceptanceSpec['binding'] {
  const terms = quote?.anchor?.terms;
  const criteria = terms && typeof terms === 'object' && !Array.isArray(terms)
    ? (terms as { success_criteria?: unknown }).success_criteria
    : null;
  if (quote?.criteriaBinding?.kind === 'signed-terms'
    && Array.isArray(criteria)
    && criteria.includes(`${termPrefix}${spec.specHash}`)) {
    return quote.criteriaBinding;
  }
  return { kind: 'pokter-asserted' };
}
