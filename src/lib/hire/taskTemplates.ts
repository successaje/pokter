export interface CommissionTaskTemplate {
  id: 'analyse' | 'recommend' | 'monitor';
  label: string;
  description: string;
  task: string;
}

const CATEGORY_CONTEXT: Record<
  string,
  { subject: string; evidence: string; risk: string }
> = {
  'health-factor': {
    subject: 'my Venus lending position',
    evidence: 'health factor, liquidation distance and protocol-source calculations',
    risk: 'the minimum action required to restore a safer margin',
  },
  rebalancing: {
    subject: 'my portfolio or liquidity position',
    evidence: 'current allocations, proposed targets and estimated execution costs',
    risk: 'the trade-offs and risks created by the proposed rebalance',
  },
  'grid-trading': {
    subject: 'the proposed BNB trading range',
    evidence: 'range boundaries, grid spacing, fee assumptions and break-even conditions',
    risk: 'the market conditions that would invalidate the plan',
  },
  yield: {
    subject: 'the available BNB Chain yield opportunities',
    evidence: 'net yield, fees, liquidity, lockups and protocol risk',
    risk: 'why the recommended route is preferable to the alternatives',
  },
};

export function commissionTaskTemplates(
  category: string,
): CommissionTaskTemplate[] {
  const context = CATEGORY_CONTEXT[category] ?? {
    subject: 'the requested onchain objective',
    evidence: 'assumptions, data sources, expected outcome and constraints',
    risk: 'the risks and conditions that could change the recommendation',
  };

  return [
    {
      id: 'analyse',
      label: 'Analyse my position',
      description: 'A read-only assessment with sources and assumptions.',
      task: `Analyse ${context.subject}. Report ${context.evidence}. State every assumption and data source. Do not execute transactions.`,
    },
    {
      id: 'recommend',
      label: 'Recommend an action',
      description: 'A decision-ready proposal without wallet execution.',
      task: `Review ${context.subject} and recommend a specific action. Include ${context.evidence}, plus ${context.risk}. Do not execute transactions.`,
    },
    {
      id: 'monitor',
      label: 'Produce a monitoring report',
      description: 'Thresholds, warning conditions and next checks.',
      task: `Produce a monitoring report for ${context.subject}. Include ${context.evidence}, the warning thresholds to watch, and ${context.risk}. Do not execute transactions.`,
    },
  ];
}
