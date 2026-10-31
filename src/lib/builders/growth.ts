import type { Category } from '@/lib/agents/categories';
import type { AssayDefinition } from '@/lib/assay/catalog';
import type { AssayRun } from '@/lib/assay/store';
import { CHECK_FRESH_DAYS, checkStanding } from '@/lib/assay/standing';
import type { OutsideTeamHistory } from '@/lib/erc8183/economic-history';
import { outcomeGaps } from '@/lib/rankings/outcomes';

export interface BuilderGrowthSnapshot {
  category: Category | 'unclassified';
  categoryLabel: string;
  check: {
    label: string;
    /** `stale`: passed, longer ago than `CHECK_FRESH_DAYS`, so it no longer counts. */
    status: 'passed' | 'stale' | 'partial' | 'unavailable' | 'not-run';
    summary: string;
    limitation: string;
    /** What it checks in two or three words, and when it ran, for a post that has to say both. */
    scope: string;
    ranAt: string | null;
  } | null;
  outcomes: OutsideTeamHistory;
  rankingEligible: boolean;
  rankingGaps: string[];
  hireNetworks: Array<{ chainId: number; label: string }>;
}

export function buildGrowthSnapshot({
  category,
  categoryLabel,
  definition,
  run,
  outcomes,
  hireNetworks = [],
  now = Date.now(),
}: {
  category: Category | 'unclassified';
  categoryLabel: string;
  definition: AssayDefinition | null;
  run: AssayRun | null;
  outcomes: OutsideTeamHistory;
  hireNetworks?: Array<{ chainId: number; label: string }>;
  now?: number;
}): BuilderGrowthSnapshot {
  const rankingGaps = outcomeGaps(outcomes);
  let check: BuilderGrowthSnapshot['check'] = null;

  if (definition) {
    const standing = checkStanding(run, now);
    const status = ({ passed: 'passed', stale: 'stale', failed: 'partial', ungraded: 'unavailable', 'not-run': 'not-run' } as const)[standing];
    const summary = !run
      ? 'No completed check yet'
      : run.status === 'checked'
        ? run.total === 0
          ? `${run.via === 'paid-hire' ? 'Delivered' : 'Answered'}, but none of it could be graded`
          : `${run.passed}/${run.total} scenarios passed${standing === 'stale' ? `, over ${CHECK_FRESH_DAYS} days ago: it no longer counts until it is graded again` : ''}`
        : run.status === 'paid-only'
          ? 'The endpoint could only be checked after payment'
          : 'The endpoint could not be asked this check';
    check = { label: definition.label, status, summary, limitation: definition.limitation, scope: definition.scope, ranAt: run?.ranAt ?? null };
  }

  return {
    category,
    categoryLabel,
    check,
    outcomes,
    rankingEligible: rankingGaps.length === 0,
    rankingGaps,
    hireNetworks,
  };
}

/*
 * A pass named by its check and dated, in a post that outlives the page:
 * "Its yield check passed" stayed true in a post long after the pass had
 * lapsed, and never said which answers it covered.
 */
function passedLine(check: BuilderGrowthSnapshot['check']): string {
  if (check?.status !== 'passed' || !check.ranAt) return '';
  const day = new Date(check.ranAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return ` On ${day} it passed Pokter’s ${check.scope} check.`;
}

export function evidenceShareText(name: string, growth: BuilderGrowthSnapshot): string {
  const facts = growth.outcomes;
  const evidence = facts.completed > 0
    ? `${facts.completed} settled outside-team job${facts.completed === 1 ? '' : 's'} from ${facts.uniqueBuyers} known buyer wallet${facts.uniqueBuyers === 1 ? '' : 's'}`
    : 'a public evidence record with no settled outside-team jobs yet';
  return `${name} has ${evidence} on Pokter.${passedLine(growth.check)}`;
}

export function launchPostText(name: string, growth: BuilderGrowthSnapshot): string {
  const category = growth.category === 'unclassified' ? 'an ERC-8004 agent' : `a ${growth.categoryLabel} agent`;
  const availability = growth.hireNetworks.length > 0
    ? `It can be hired through escrow on ${growth.hireNetworks.map((network) => network.label).join(' and ')}.`
    : 'Its public evidence record is live; a payable hire route has not been verified yet.';
  return `${name} is now listed on Pokter as ${category}. ${availability}${passedLine(growth.check)} See the live checks, signed price and paid-job receipts before deciding.`;
}

export function buyerPostText(name: string, growth: BuilderGrowthSnapshot): string {
  const work = growth.category === 'unclassified'
    ? `If ${name} fits a task you need done,`
    : `Need a ${growth.categoryLabel.toLowerCase()} assessment?`;
  const action = growth.hireNetworks.length > 0
    ? ` Hire ${name} on ${growth.hireNetworks.map((network) => network.label).join(' or ')} through ERC-8183 escrow.`
    : ` Follow ${name}’s public record while its payable route is being verified.`;
  return `${work}${action} Pokter keeps the agent’s live checks and paid-job outcomes visible on one public page.`;
}
