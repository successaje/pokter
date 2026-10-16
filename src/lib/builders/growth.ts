import type { Category } from '@/lib/agents/categories';
import type { AssayDefinition } from '@/lib/assay/catalog';
import type { AssayRun } from '@/lib/assay/store';
import type { OutsideTeamHistory } from '@/lib/erc8183/economic-history';
import { outcomeGaps } from '@/lib/rankings/outcomes';

export interface BuilderGrowthSnapshot {
  category: Category | 'unclassified';
  categoryLabel: string;
  check: {
    label: string;
    status: 'passed' | 'partial' | 'unavailable' | 'not-run';
    summary: string;
    limitation: string;
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
}: {
  category: Category | 'unclassified';
  categoryLabel: string;
  definition: AssayDefinition | null;
  run: AssayRun | null;
  outcomes: OutsideTeamHistory;
  hireNetworks?: Array<{ chainId: number; label: string }>;
}): BuilderGrowthSnapshot {
  const rankingGaps = outcomeGaps(outcomes);
  let check: BuilderGrowthSnapshot['check'] = null;

  if (definition) {
    const passed = run?.status === 'checked' && run.total > 0 && run.passed === run.total;
    const status = !run
      ? 'not-run'
      : run.status !== 'checked'
        ? 'unavailable'
        : passed
          ? 'passed'
          : 'partial';
    const summary = !run
      ? 'No completed check yet'
      : run.status === 'checked'
        ? `${run.passed}/${run.total} scenarios passed`
        : run.status === 'paid-only'
          ? 'The endpoint could only be checked after payment'
          : 'The endpoint could not be asked this check';
    check = { label: definition.label, status, summary, limitation: definition.limitation };
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

export function evidenceShareText(name: string, growth: BuilderGrowthSnapshot): string {
  const facts = growth.outcomes;
  const evidence = facts.completed > 0
    ? `${facts.completed} settled outside-team job${facts.completed === 1 ? '' : 's'} from ${facts.uniqueBuyers} known buyer wallet${facts.uniqueBuyers === 1 ? '' : 's'}`
    : 'a public evidence record with no settled outside-team jobs yet';
  const check = growth.check?.status === 'passed' ? ` Its ${growth.check.label.toLowerCase()} passed.` : '';
  return `${name} has ${evidence} on Pokter.${check}`;
}

export function launchPostText(name: string, growth: BuilderGrowthSnapshot): string {
  const category = growth.category === 'unclassified' ? 'an ERC-8004 agent' : `a ${growth.categoryLabel} agent`;
  const availability = growth.hireNetworks.length > 0
    ? `It can be hired through escrow on ${growth.hireNetworks.map((network) => network.label).join(' and ')}.`
    : 'Its public evidence record is live; a payable hire route has not been verified yet.';
  const check = growth.check?.status === 'passed'
    ? ` Pokter’s ${growth.check.label.toLowerCase()} passed.`
    : '';
  return `${name} is now listed on Pokter as ${category}. ${availability}${check} See the live checks, signed price and paid-job receipts before deciding.`;
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
