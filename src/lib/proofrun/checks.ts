import type { AcceptanceSpec, CheckResult, Criterion, VerificationState } from '@/lib/shared/contracts';
import type { ChainClaim, CheckedValue, VenusReportVerification } from '@/lib/delivery/venus-report-check';
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

/**
 * What to say about a criterion nothing settled, given how it got there.
 *
 * Said two ways because only one of them is true at a time, and the
 * wrong one is a claim rather than a clumsiness. An artifact for job
 * 56/57004 carried `binding: pokter-asserted` — the agent never agreed
 * to these criteria — above seven rows each reading "This criterion was
 * **agreed** but nothing settled it". The verdict was right and the
 * sentence above it was wrong, which is the failure this whole feature
 * is built to catch, reproduced inside it.
 */
function unsettledLimitation(binding: AcceptanceSpec['binding'] | undefined): string {
  return binding?.kind === 'signed-terms'
    ? 'Agreed with the agent, but nothing in the delivery or the chain reading settled it.'
    : 'Recorded by Pokter and not agreed by the agent, and nothing in the delivery or the chain reading settled it.';
}

export function checksFromVerification(input: {
  verification: VenusReportVerification;
  criteria?: readonly Criterion[];
  blockHash?: string | null;
  /** How the criteria were bound, so a row cannot claim agreement the spec denies. */
  binding?: AcceptanceSpec['binding'];
  /**
   * What the report said about its chain.
   *
   * Needed because the checker, like the account check, only emits a row
   * when the claim is wrong. Without this, a report that correctly named
   * its chain is indistinguishable from one that never named a chain at
   * all, and both would read as not verified — understating the first.
   */
  chainClaim?: ChainClaim;
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
   * The account check the checker only reports when it fails.
   *
   * `preEvidenceVerdict` refuses outright when the report is about
   * another wallet, emitting an `Account` row and going no further. So a
   * verdict that reached a real comparison is proof the account matched
   * — the checker could not have got there otherwise — but no row says
   * so, and leaving it not-verified understates a check that genuinely
   * ran. That is the opposite of this module's usual error and still a
   * misreport.
   *
   * Inferred only from `verdict`, never from the absence of a row: an
   * `unverified` verdict may have stopped before the account was
   * examined at all, and that case stays not-verified.
   */
  if (!placed.has('binding.account') && input.verification.verdict !== 'unverified') {
    const criterion = criteria.find((c) => c.id === 'binding.account');
    results.push({
      id: 'binding.account',
      label: criterion?.label ?? 'The report is about the account the brief named',
      outcome: 'passed',
      expected: 'the account the brief named',
      observed: 'the same account',
      source,
      tolerance: null,
      limitation: 'The checker refuses a report about another account before reading the chain, so reaching a comparison establishes this.',
    });
    placed.add('binding.account');
  }

  /*
   * The chain check, which is also only reported when it fails.
   *
   * A pass is inferred only when the report actually named a chain by
   * id: `kind: 'none'` is a report that said nothing, and that stays not
   * verified however far the check got, because the criterion is that
   * the report names its chain and this one did not.
   */
  if (!placed.has('binding.chain') && input.verification.verdict !== 'unverified' && input.chainClaim?.kind === 'id') {
    const criterion = criteria.find((c) => c.id === 'binding.chain');
    results.push({
      id: 'binding.chain',
      label: criterion?.label ?? 'The report names the chain its figures were read on',
      outcome: 'passed',
      expected: String(input.chainClaim.chainId),
      observed: String(input.chainClaim.chainId),
      source,
      tolerance: null,
      limitation: 'The checker refuses a report naming another chain, so reaching a comparison establishes this.',
    });
    placed.add('binding.chain');
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
      limitation: unsettledLimitation(input.binding),
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
