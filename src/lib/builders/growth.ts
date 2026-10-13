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
}

export function buildGrowthSnapshot({
  category,
  categoryLabel,
  definition,
  run,
  outcomes,
}: {
  category: Category | 'unclassified';
  categoryLabel: string;
  definition: AssayDefinition | null;
  run: AssayRun | null;
  outcomes: OutsideTeamHistory;
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
  };
}

export function evidenceShareText(name: string, growth: BuilderGrowthSnapshot): string {
  const facts = growth.outcomes;
  const evidence = facts.completed > 0
    ? `${facts.completed} accepted outside-team job${facts.completed === 1 ? '' : 's'} from ${facts.uniqueBuyers} known buyer wallet${facts.uniqueBuyers === 1 ? '' : 's'}`
    : 'a public evidence record with no accepted outside-team jobs yet';
  const check = growth.check?.status === 'passed' ? ` Its ${growth.check.label.toLowerCase()} passed.` : '';
  return `${name} has ${evidence} on Pokter.${check}`;
}
