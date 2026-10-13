import type { Category } from '@/lib/agents/categories';
import { HF_SUITE_ID } from './health-factor';
import { staticSuiteFor } from './category-suites';

export interface AssayDefinition {
  id: string;
  label: string;
  provenance: string;
  limitation: string;
  live: boolean;
}

export function assayForCategory(category: Category | 'unclassified'): AssayDefinition | null {
  if (category === 'health-factor') {
    return {
      id: HF_SUITE_ID,
      label: 'Health factor check',
      provenance: 'Live Venus Core Pool positions read from BNB Smart Chain immediately around the agent reply.',
      limitation: 'Checks the reported health factor and liquidation state, not advice, timing or transaction execution.',
      live: true,
    };
  }
  const suite = staticSuiteFor(category);
  return suite ? { id: suite.id, label: suite.label, provenance: suite.provenance, limitation: suite.limitation, live: false } : null;
}
