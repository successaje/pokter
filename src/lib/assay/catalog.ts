import type { Category } from '@/lib/agents/categories';
import { HF_SUITE_ID } from './health-factor';
import { V3_SUITE_ID } from './paid-brief';
import { staticSuiteFor } from './category-suites';

export interface AssayDefinition {
  id: string;
  label: string;
  provenance: string;
  limitation: string;
  /** What a pass leaves unchecked, short enough to stand beside the result. */
  unverified: string;
  /** What it checks in two or three words, for a label that has to name it: "Checked: health factor". */
  scope: string;
  live: boolean;
}

export function assayForCategory(category: Category | 'unclassified'): AssayDefinition | null {
  if (category === 'health-factor') {
    return {
      id: HF_SUITE_ID,
      label: 'Health factor check',
      provenance: 'Live Venus Core Pool positions read from BNB Smart Chain immediately around the agent reply.',
      limitation: 'Checks the reported health factor and liquidation state, not advice, timing or transaction execution.',
      unverified: 'Advice, timing, and any transaction it suggests',
      scope: 'health factor',
      live: true,
    };
  }
  if (category === 'rebalancing') {
    /*
     * The rebalancing category holds two different jobs, and the service
     * Pokter lists here reviews a concentrated-liquidity position range
     * for a named wallet. The old fixture asked for portfolio-weight
     * drift arithmetic over values supplied as JSON, which that service
     * refuses outright — so the check it is measured by is the position
     * one, graded from a paid hire against Pokter's own reading of the
     * pool (see `v3-grade.ts`).
     */
    return {
      id: V3_SUITE_ID,
      label: 'Position range check',
      provenance: 'Live PancakeSwap v3 positions on BNB Smart Chain, read by Pokter from the position manager and each pool at one settled block.',
      /*
       * "None invented" was claimed here, and the grade catches an invented
       * position only in a wallet that holds none: with positions, it scores
       * the ones Pokter reads and an extra one named in the answer goes
       * unremarked.
       */
      limitation: 'Checks whether each position Pokter reads is reported as earning at the current price, and that none is left out. An extra position the answer names is caught only in a wallet that holds none. It does not check the value, the uncollected fees or the re-centre plan, which rest on arithmetic Pokter would repeat identically.',
      unverified: 'Position values, uncollected fees and the re-centre plan',
      scope: 'position range',
      live: false,
    };
  }
  const suite = staticSuiteFor(category);
  return suite ? { id: suite.id, label: suite.label, provenance: suite.provenance, limitation: suite.limitation, unverified: suite.unverified, scope: suite.scope, live: false } : null;
}
