import type { OutsideTeamHistory } from '@/lib/erc8183/economic-history';

/**
 * The evidence ladder: what Pokter has seen an agent do, in the order a
 * buyer needs it. One vocabulary for every card, page and API.
 *
 * It replaced an eight-step ladder (Registered, Reachable, Compatible, Task
 * tested, Hired, Delivered, Market proven, Reliable operator) that sat beside
 * a six-word verdict and the card pills, so one agent could carry three
 * different status words at once. Registration is implied by being listed,
 * a funded job says nothing about the agent until it delivers, and a long
 * reliable record is a qualifier on the last step rather than a step of its
 * own. The verdict remains, and is described as availability only.
 */
export type MaturityId = 'answers' | 'priced' | 'delivered' | 'checked' | 'proven-in-use';

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
  /**
   * Answered the live check made when its page loaded. Counts for
   * "Answers" when no scheduled check has run: an agent that answered a
   * moment ago was being described as one that "has not answered Pokter's
   * checks", when none had been made.
   */
  liveAnswered?: boolean;
  observedDays: number;
}

export interface MaturityStep {
  id: MaturityId;
  label: string;
  earned: boolean;
  detail: string;
}

export interface AgentMaturity {
  /** The most advanced step earned, or null when none has been. */
  current: MaturityId | null;
  label: string;
  summary: string;
  steps: MaturityStep[];
  /** Proven in use, and kept up: 30+ observed days with a high completion and answer rate. */
  sustained: boolean;
}

export const MARKET_PROVEN_BUYERS = 3;
export const MARKET_PROVEN_COMPLETIONS = 3;
export const RELIABLE_TERMINAL_JOBS = 5;
export const RELIABLE_MIN_RATE = 0.9;
export const RELIABLE_OBSERVED_DAYS = 30;

const ORDER: MaturityId[] = ['answers', 'priced', 'delivered', 'checked', 'proven-in-use'];

const LABEL: Record<MaturityId, string> = {
  answers: 'Answers',
  priced: 'Priced',
  delivered: 'Delivered',
  checked: 'Checked',
  'proven-in-use': 'Proven in use',
};

/** What each step means, for methodology and anywhere a step needs explaining. */
export const LADDER_MEANING: Record<MaturityId, string> = {
  answers: 'Answered Pokter’s checks of its published endpoint.',
  priced: 'A buyer can get current terms, signed by the agent’s wallet, that an escrow can pay.',
  delivered: 'At least one paid job delivered from the agent’s own wallet. Lifecycle demonstrations and deliveries Pokter’s wallets submitted do not count.',
  checked: 'Passed the latest correctness check for its category, judged against chain data.',
  'proven-in-use': `Settled work from at least ${MARKET_PROVEN_BUYERS} buyer wallets outside Pokter’s team, ${MARKET_PROVEN_COMPLETIONS} or more jobs.`,
};

/** The ladder's steps, in order, for pages that describe it. */
export const LADDER: ReadonlyArray<{ id: MaturityId; label: string; meaning: string }> = ORDER.map((id) => ({ id, label: LABEL[id], meaning: LADDER_MEANING[id] }));

/**
 * The evidence ladder for one agent.
 *
 * Steps are facts, not a strict funnel: an agent can deliver before Pokter
 * has a category check for it, and the skipped step stays visible rather
 * than being assumed. The label is the most advanced step earned.
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

  /*
   * Delivered, but only ever to Pokter's team. The house agents reached
   * "Delivered" on team-funded test hires, and the label alone read like a
   * customer had paid. Said in the label as well as the step, so a card
   * shows it without opening the ladder.
   */
  const teamOnlyDeliveries = facts.delivered && facts.outsideTeam.completed === 0;
  const earned: Record<MaturityId, boolean> = {
    answers: facts.reachable || (facts.probeRate === null && facts.liveAnswered === true),
    priced: facts.compatible,
    delivered: facts.delivered,
    checked: facts.tested,
    'proven-in-use': marketProven,
  };

  const steps: MaturityStep[] = [
    { id: 'answers', label: LABEL.answers, earned: earned.answers, detail: facts.probeRate === null ? (facts.liveAnswered ? 'Answered the live check when this page loaded; no scheduled checks yet.' : 'Not checked yet.') : `Answered ${Math.round(facts.probeRate * 100)}% of Pokter’s checks.` },
    { id: 'priced', label: LABEL.priced, earned: earned.priced, detail: earned.priced ? 'Signed, payable terms are available to a buyer.' : 'No current signed price an escrow can pay.' },
    {
      id: 'delivered',
      label: LABEL.delivered,
      earned: earned.delivered,
      detail: earned.delivered
        ? teamOnlyDeliveries
          ? 'Paid jobs delivered from the agent’s own wallet, all funded by Pokter’s team so far: no outside buyer has settled one yet.'
          : 'A paid job delivered from the agent’s own wallet.'
        : facts.deliveredByOperator
          ? 'A delivery reached escrow, but a Pokter wallet submitted it rather than the agent.'
          : facts.hired
            ? 'Hired, with no delivery from the agent yet.'
            : 'No paid delivery yet.',
    },
    { id: 'checked', label: LABEL.checked, earned: earned.checked, detail: earned.checked ? 'Passed the latest correctness check for its category.' : 'No passing correctness check on record.' },
    {
      id: 'proven-in-use',
      label: LABEL['proven-in-use'],
      earned: earned['proven-in-use'],
      detail:
        `${facts.outsideTeam.completed}/${MARKET_PROVEN_COMPLETIONS} settled outside-team jobs from ${facts.outsideTeam.uniqueBuyers}/${MARKET_PROVEN_BUYERS} buyer wallets.` +
        (reliable ? ` Sustained: ${Math.floor(facts.observedDays)} observed days at ${Math.round((facts.outsideTeam.completionRate ?? 0) * 100)}% completion.` : ''),
    },
  ];

  const current = [...ORDER].reverse().find((id) => earned[id]) ?? null;
  const label = current === 'delivered' && teamOnlyDeliveries ? 'Delivered (team hires)' : current ? LABEL[current] : 'Not answering yet';
  const summary = current
    ? LADDER_MEANING[current]
    : facts.probeRate === null
      ? 'Listed in the registry; Pokter has not checked it yet.'
      : 'Listed in the registry; it has not answered Pokter’s checks.';
  return { current, label, summary, steps, sustained: reliable };
}
