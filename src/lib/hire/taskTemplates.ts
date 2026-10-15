export interface CommissionTaskTemplate {
  id: 'analyse' | 'recommend' | 'monitor' | `declared-${number}`;
  label: string;
  /*
   * What the segmented control shows on a narrow screen.
   *
   * The three full labels are the longest set anywhere in the app, and the
   * control lays them out in equal columns without wrapping — so on a phone
   * they printed on top of one another in the middle of the hire step.
   */
  short: string;
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
      short: 'Analyse',
      description: 'A read-only assessment with sources and assumptions.',
      task: `Analyse ${context.subject}. Report ${context.evidence}. State every assumption and data source. Do not execute transactions.`,
    },
    {
      id: 'recommend',
      label: 'Recommend an action',
      short: 'Recommend',
      description: 'A decision-ready proposal without wallet execution.',
      task: `Review ${context.subject} and recommend a specific action. Include ${context.evidence}, plus ${context.risk}. Do not execute transactions.`,
    },
    {
      id: 'monitor',
      label: 'Produce a monitoring report',
      short: 'Monitor',
      description: 'Thresholds, warning conditions and next checks.',
      task: `Produce a monitoring report for ${context.subject}. Include ${context.evidence}, the warning thresholds to watch, and ${context.risk}. Do not execute transactions.`,
    },
  ];
}


/**
 * Task suggestions taken from the agent's own card.
 *
 * The three templates above are chosen by category, which assumes every
 * agent is one of five kinds of DeFi assistant. An agent in no category
 * falls through to generic wording — and Pokter's own evidence agent was
 * hired on mainnet with "Analyse the requested onchain objective",
 * a brief it had to refuse, while its card published the exact two
 * formats that would have worked under its `agent_evidence` skill.
 *
 * A2A carries `examples` on a skill precisely so a caller knows how to
 * ask. Where an agent has written them down, they are better than
 * anything Pokter can infer: they come from the party that knows what
 * the agent accepts.
 *
 * Returns an empty list when the card says nothing, and the caller keeps
 * the category templates. Nothing is invented here.
 */
export function templatesFromSkills(
  skills: readonly { name: string; kind?: string; examples: readonly string[] }[],
): CommissionTaskTemplate[] {
  const templates: CommissionTaskTemplate[] = [];
  const seen = new Set<string>();

  /*
   * A free preview's input is how to ask for the preview. It is not
   * evidence of what the paid job accepts, so it is never offered as a
   * paid brief (see `briefSourceFor`).
   */
  for (const skill of skills.filter((s) => s.kind !== 'preview')) {
    for (const example of skill.examples) {
      const task = example.trim();
      if (!task || seen.has(task.toLowerCase())) continue;
      seen.add(task.toLowerCase());
      // A JSON example reads as noise on a button; the skill's own name is the label.
      const shown = task.startsWith('{') ? skill.name : task;
      templates.push({
        id: `declared-${templates.length}`,
        label: shown.length <= 28 ? shown : `${shown.slice(0, 27)}…`,
        short: shown.length <= 14 ? shown : `${shown.slice(0, 13)}…`,
        // Figures in an operator's example are theirs, not market data or the buyer's choice.
        description: `From this agent's own card, under “${skill.name}”.${/\d/.test(task) ? ' Its figures are the operator’s example: replace them with yours.' : ''}`,
        task,
      });
      if (templates.length === 3) return templates;
    }
  }

  return templates;
}

/**
 * Where the hire page's brief comes from, so it can say so.
 *
 * - `declared`: the agent's card shows how to ask for its paid work.
 * - `preview-only`: the card documents a free preview but not the paid
 *   job's input. The preview's format is shown as what it is, and the
 *   buyer can try it free, but it is not passed off as the paid brief.
 * - `unknown`: the card says nothing about input. Pokter's generic wording
 *   is offered, labelled as Pokter's, not as something the agent supports.
 */
export type BriefSource = 'declared' | 'preview-only' | 'unknown';

export function briefSourceFor(
  skills: readonly { kind?: string; examples: readonly string[] }[],
): BriefSource {
  if (templatesFromSkills(skills.map((s) => ({ name: '', ...s }))).length > 0) return 'declared';
  if (skills.some((s) => s.kind === 'preview')) return 'preview-only';
  return 'unknown';
}
