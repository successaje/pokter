export type LaunchBrief = {
  outcome: string;
  audience: string;
  task: string;
  evidence: string;
  limits: string;
  interaction: 'task' | 'tool';
};

export type BriefDraft = {
  name: string;
  description: string;
  category: string;
  protocol: 'a2a' | 'mcp';
};

export const EMPTY_BRIEF: LaunchBrief = {
  outcome: '', audience: '', task: '', evidence: '', limits: '', interaction: 'task',
};

const OUTCOME_NAMES: Record<string, string> = {
  rebalancing: 'Allocation Guide',
  'grid-trading': 'Trading Plan Agent',
  yield: 'Yield Researcher',
  'health-factor': 'Position Guardian',
};

function sentence(value: string) {
  const trimmed = value.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  return trimmed ? `${trimmed[0].toUpperCase()}${trimmed.slice(1)}` : '';
}

export function draftFromBrief(brief: LaunchBrief): BriefDraft {
  const task = sentence(brief.task);
  const audience = brief.audience.trim().replace(/\s+/g, ' ');
  const evidence = brief.evidence.trim().replace(/\s+/g, ' ');
  const limits = brief.limits.trim().replace(/\s+/g, ' ');
  return {
    name: OUTCOME_NAMES[brief.outcome] ?? 'BNB Chain Agent',
    description: `${task} for ${audience}. The result includes ${evidence}. It does not ${limits}.`.slice(0, 600),
    category: brief.outcome,
    protocol: brief.interaction === 'tool' ? 'mcp' : 'a2a',
  };
}
