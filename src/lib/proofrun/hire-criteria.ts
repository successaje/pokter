import { VENUS_COMPTROLLER } from '@/lib/assay/venus';
import { VENUS_CHAIN_ID, venusHealthJob, venusSubjectFromBrief } from '@/lib/delivery/venus-report-check';

import type { AcceptanceSpec } from '@/lib/shared/contracts';

import { criteriaForTerms, venusAcceptanceSpec } from './acceptance';

/**
 * The acceptance criteria a hire carries, decided from the hire itself.
 *
 * Pokter's quote route has always accepted `successCriteria` from its
 * caller, and no caller ever sent any — so the field that turns "Pokter
 * recorded these criteria" into "the agent signed them" was reachable and
 * unused, and every hire quoted without one. Composing them here is what
 * makes the binding the normal case rather than something a buyer has to
 * know to ask for.
 *
 * Two conditions, and both are borrowed rather than invented:
 *
 * `venusHealthJob` is the predicate ProofRun already uses to decide a
 * delivered job is this check's. Criteria must describe the check that
 * will actually run, so the hire and the check have to agree about which
 * jobs they are talking about — a second, similar-looking rule here would
 * eventually disagree with it, and the disagreement would show up as an
 * agent bound to criteria nobody ever evaluates.
 *
 * A resolvable subject is required for the same reason. `binding.account`
 * says the report is about the account the brief named; a brief naming
 * none, or naming two, gives ProofRun nothing to check and it refuses the
 * job with `no-subject` or `ambiguous-subject`. Binding an agent to a
 * criterion that can never be evaluated is not a stricter standard, it is
 * a meaningless one.
 *
 * Returns undefined for everything else, which is not a refusal: a quote
 * without criteria is ordinary and verifies exactly as before. It costs
 * the binding and nothing else.
 */
export function hireAcceptanceSpec(input: { category?: string | null; brief: string }): AcceptanceSpec | null {
  if (!venusHealthJob({ category: input.category, brief: input.brief })) return null;
  if (!venusSubjectFromBrief(input.brief).ok) return null;
  /*
   * The deployment the check reads, not the escrow the job is paid on. A
   * testnet escrow buys an answer about Venus on mainnet, so the spec hash
   * names chain 56 whichever chain the money is on — and it must, because
   * the hash has to match the one ProofRun recomputes.
   */
  return venusAcceptanceSpec({ deployment: VENUS_COMPTROLLER, chainId: VENUS_CHAIN_ID });
}

/** The criteria to put in the negotiated terms, or undefined for a hire this does not cover. */
export function hireCriteria(input: { category?: string | null; brief: string }): string[] | undefined {
  const spec = hireAcceptanceSpec(input);
  return spec ? criteriaForTerms(spec) : undefined;
}
