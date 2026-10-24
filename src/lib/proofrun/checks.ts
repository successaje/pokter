import type { CheckResult, Criterion, VerificationState } from '@/lib/shared/contracts';
import type { CheckedValue, VenusReportVerification } from '@/lib/delivery/venus-report-check';
import { venusHealthCriteria } from './acceptance';

/**
 * The existing Venus verdict, said as named checks a buyer can act on.
 *
 * This is a translation and not a second opinion. Every outcome below is
 * decided by `verifyVenusReport`, which stays the only thing that compares
 * a report with the chain; what is added here is a stable id per check, so
 * a receipt written today can be compared with a replay run next month
 * without matching on prose that may have been reworded in between.
 *
 * The rule the whole feature rests on is in `outcomeOf`: a check becomes
 * `passed` only when the comparison ran and agreed. Unknown, unsupported,
 * missing and not-compared are all `not-verified`, and the reason travels
 * in `limitation` so the buyer is told which of those it was.
 */

/**
 * The label the checker emits, against the criterion it settles.
 *
 * Matching on prose is fragile, so the fragility is concentrated here and
 * guarded by a test that fails when the checker emits a label this table
 * does not know. The alternative — recomputing the comparisons here to get
 * ids — would be the parallel engine this feature is specifically not
 * allowed to grow.
 */
const LABEL_TO_CRITERION: ReadonlyMap<string, string> = new Map([
  ['Account', 'binding.account'],
  ['Chain', 'binding.chain'],
  ['Health factor', 'hf.value'],
  ['Liquidatable', 'hf.liquidatable'],
  ['Debt (USD)', 'position.debt_usd'],
  ['Collateral (USD)', 'position.collateral_usd'],
]);

export function criterionIdForLabel(label: string): string | null {
  return LABEL_TO_CRITERION.get(label) ?? null;
}

/** Labels this module can place. Exported so a test can hold the checker to them. */
export const KNOWN_CHECK_LABELS: readonly string[] = [...LABEL_TO_CRITERION.keys()];

/**
 * `agrees` as one of the three outcomes a buyer sees.
 *
 * `null` is the case worth naming: the checker uses it for a comparison it
 * declined to make — a figure stated to too few decimals to compare, a
 * chain it could not resolve — and treating that as agreement is precisely
 * the silent pass this feature exists to refuse.
 */
function outcomeOf(agrees: boolean | null): CheckResult['outcome'] {
  if (agrees === true) return 'passed';
  if (agrees === false) return 'failed';
  return 'not-verified';
}

function toleranceFor(id: string, criteria: readonly Criterion[]): string | null {
  const criterion = criteria.find((c) => c.id === id);
  const tolerance = criterion?.check.tolerance;
  if (tolerance === undefined) return null;
  return id.endsWith('_usd') ? `±${tolerance * 100}%` : `±${tolerance}`;
}

export function checksFromVerification(input: {
  verification: VenusReportVerification;
  criteria?: readonly Criterion[];
  blockHash?: string | null;
}): CheckResult[] {
  const criteria = input.criteria ?? venusHealthCriteria();
  const source = { block: input.verification.block, hash: input.blockHash ?? null };
  const placed = new Set<string>();

  const results: CheckResult[] = input.verification.values.map((value: CheckedValue, index) => {
    const id = criterionIdForLabel(value.label) ?? `unmapped.${index}`;
    placed.add(id);
    const criterion = criteria.find((c) => c.id === id);
    return {
      id,
      label: criterion?.label ?? value.label,
      outcome: outcomeOf(value.agrees),
      expected: value.checked,
      observed: value.reported,
      source,
      tolerance: toleranceFor(id, criteria),
      ...(value.note ? { limitation: value.note } : {}),
      /*
       * A label this module does not know still reaches the buyer, with
       * its own prose, rather than being dropped. Losing a comparison the
       * checker made would under-report a failure, which is the one
       * direction this must never err in.
       */
      ...(id.startsWith('unmapped.')
        ? { limitation: `${value.note ? `${value.note} ` : ''}Reported as “${value.label}”, which this version does not map to a named criterion.` }
        : {}),
    };
  });

  /*
   * The binding check the checker expresses structurally rather than as a
   * value: it refuses outright when a report names no block, so a verdict
   * that reached here with a block satisfies it and one without never did.
   */
  if (!placed.has('binding.block')) {
    const criterion = criteria.find((c) => c.id === 'binding.block');
    results.unshift({
      id: 'binding.block',
      label: criterion?.label ?? 'The report names the block its figures were read at',
      outcome: input.verification.block ? 'passed' : 'not-verified',
      expected: 'a block number in the report',
      observed: input.verification.block ?? 'none',
      source,
      tolerance: null,
      ...(input.verification.block ? {} : { limitation: 'Without a named block there is nothing to check the figures against.' }),
    });
    placed.add('binding.block');
  }

  /*
   * Every agreed criterion appears, including ones nothing compared. A
   * criterion silently missing from the results would read as satisfied to
   * anyone counting rows, which is the same failure as marking it passed.
   */
  for (const criterion of criteria) {
    if (placed.has(criterion.id)) continue;
    results.push({
      id: criterion.id,
      label: criterion.label,
      outcome: 'not-verified',
      expected: '—',
      observed: '—',
      source,
      tolerance: toleranceFor(criterion.id, criteria),
      limitation: 'This criterion was agreed but nothing in the delivery or the chain reading settled it.',
    });
  }

  return results;
}

/**
 * The summary, derived from the checks rather than carried beside them.
 *
 * Derived so the two cannot disagree: a headline of "verified" above a
 * failed row is the kind of contradiction a reader believes over the
 * detail, and it can only happen if the summary is stored separately.
 *
 * `verified` needs every check passed and at least one check to have run.
 * An empty result set is `unverifiable`, never `verified` — nothing
 * checked is not the same as nothing wrong.
 */
export function stateFromChecks(checks: readonly CheckResult[]): VerificationState {
  if (checks.length === 0) return 'unverifiable';
  if (checks.some((c) => c.outcome === 'failed')) return 'mismatch';
  if (checks.some((c) => c.outcome === 'not-verified')) return 'unverifiable';
  return 'verified';
}

/** The one line a buyer reads first, in the same terms as the rows beneath it. */
export function headlineFor(checks: readonly CheckResult[]): string {
  const failed = checks.filter((c) => c.outcome === 'failed').length;
  const unverified = checks.filter((c) => c.outcome === 'not-verified').length;
  const passed = checks.filter((c) => c.outcome === 'passed').length;

  if (checks.length === 0) return 'Nothing was checked.';
  if (failed > 0) {
    return `${failed} of ${checks.length} checks contradicted the report${unverified > 0 ? `, and ${unverified} could not be checked` : ''}.`;
  }
  if (unverified > 0) {
    return passed > 0
      ? `${passed} of ${checks.length} checks matched; ${unverified} could not be checked.`
      : 'Nothing could be checked against the chain.';
  }
  return `All ${checks.length} checks matched Venus’s own accounting.`;
}
