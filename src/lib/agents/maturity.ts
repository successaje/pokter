import type { OutsideTeamHistory } from '@/lib/erc8183/economic-history';

export type MaturityId =
  | 'registered'
  | 'reachable'
  | 'compatible'
  | 'tested'
  | 'hired'
  | 'delivered'
  | 'market-proven'
  | 'reliable-operator';

export interface MaturityFacts {
  registered: boolean;
  reachable: boolean;
  compatible: boolean;
  tested: boolean;
  hired: boolean;
  /** A delivery from a wallet Pokter does not operate. */
  delivered: boolean;
  /**
   * A delivery reached escrow, but a declared Pokter wallet submitted it.
   *
   * Shown rather than dropped: the buyer was served and the escrow settled,
   * which is worth knowing. It is just not evidence the agent can deliver,
   * so it does not earn the milestone.
   */
  deliveredByOperator: boolean;
  outsideTeam: OutsideTeamHistory;
  probeRate: number | null;
  observedDays: number;
}

export interface MaturityStep {
  id: MaturityId;
  label: string;
  earned: boolean;
  detail: string;
}

export interface AgentMaturity {
  current: MaturityId;
  label: string;
  summary: string;
  steps: MaturityStep[];
}

export const MARKET_PROVEN_BUYERS = 3;
export const MARKET_PROVEN_COMPLETIONS = 3;
export const RELIABLE_TERMINAL_JOBS = 5;
export const RELIABLE_MIN_RATE = 0.9;
export const RELIABLE_OBSERVED_DAYS = 30;

const ORDER: MaturityId[] = ['registered', 'reachable', 'compatible', 'tested', 'hired', 'delivered', 'market-proven', 'reliable-operator'];

const LABEL: Record<MaturityId, string> = {
  registered: 'Registered',
  reachable: 'Reachable',
  compatible: 'Compatible',
  tested: 'Task tested',
  hired: 'Hired',
  delivered: 'Delivered',
  'market-proven': 'Market proven',
  'reliable-operator': 'Reliable operator',
};

/**
 * Commercial maturity, separate from Pokter's evidence verdict.
 *
 * Milestones are facts, not a strict funnel: an agent can deliver before
 * Pokter has a category-specific test for it. The current label is the most
 * advanced earned milestone, while the full ladder keeps skipped evidence
 * visible rather than pretending it happened.
 */
export function deriveMaturity(facts: MaturityFacts): AgentMaturity {
  const marketProven =
    facts.outsideTeam.completed >= MARKET_PROVEN_COMPLETIONS &&
    facts.outsideTeam.uniqueBuyers >= MARKET_PROVEN_BUYERS;
  const reliable =
    marketProven &&
    facts.outsideTeam.terminal >= RELIABLE_TERMINAL_JOBS &&
    (facts.outsideTeam.completionRate ?? 0) >= RELIABLE_MIN_RATE &&
    facts.observedDays >= RELIABLE_OBSERVED_DAYS &&
    (facts.probeRate ?? 0) >= RELIABLE_MIN_RATE;

  const earned: Record<MaturityId, boolean> = {
    registered: facts.registered,
    reachable: facts.reachable,
    compatible: facts.compatible,
    tested: facts.tested,
    hired: facts.hired,
    delivered: facts.delivered,
    'market-proven': marketProven,
    'reliable-operator': reliable,
  };

  const steps: MaturityStep[] = [
    { id: 'registered', label: LABEL.registered, earned: earned.registered, detail: 'ERC-8004 identity exists.' },
    { id: 'reachable', label: LABEL.reachable, earned: earned.reachable, detail: 'Answered at least one Pokter endpoint check.' },
    { id: 'compatible', label: LABEL.compatible, earned: earned.compatible, detail: 'A buyer can obtain payable terms and open the hire flow.' },
    { id: 'tested', label: LABEL.tested, earned: earned.tested, detail: 'Passed the latest category-specific correctness suite.' },
    { id: 'hired', label: LABEL.hired, earned: earned.hired, detail: 'At least one escrow job was funded.' },
    {
      id: 'delivered',
      label: LABEL.delivered,
      earned: earned.delivered,
      detail: !earned.delivered && facts.deliveredByOperator
        ? 'A delivery reached escrow, but a Pokter-operated wallet submitted it rather than the agent itself.'
        : 'At least one delivery reached escrow from the agent’s own wallet.',
    },
    {
      id: 'market-proven',
      label: LABEL['market-proven'],
      earned: marketProven,
      detail: `${facts.outsideTeam.completed}/${MARKET_PROVEN_COMPLETIONS} accepted outside-team jobs from ${facts.outsideTeam.uniqueBuyers}/${MARKET_PROVEN_BUYERS} buyer wallets.`,
    },
    {
      id: 'reliable-operator',
      label: LABEL['reliable-operator'],
      earned: reliable,
      detail: `${facts.outsideTeam.terminal}/${RELIABLE_TERMINAL_JOBS} terminal outside-team jobs · ${facts.outsideTeam.completionRate === null ? 'no rate yet' : `${Math.round(facts.outsideTeam.completionRate * 100)}% completed`} · ${Math.floor(facts.observedDays)}/${RELIABLE_OBSERVED_DAYS} observed days.`,
    },
  ];

  const current = [...ORDER].reverse().find((id) => earned[id]) ?? 'registered';
  const summary = current === 'reliable-operator'
    ? 'Repeated outside-team work, strong delivery outcomes and a sustained availability record.'
    : current === 'market-proven'
      ? 'Accepted work from at least three outside-team buyer wallets.'
      : steps.find((step) => step.id === current)?.detail ?? 'Registered identity.';
  return { current, label: LABEL[current], summary, steps };
}
