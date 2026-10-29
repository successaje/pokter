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
  /**
   * Of those, a delivery whose manifest carries the agent's own answer:
   * Pokter's courier submitted the transaction, the agent produced the
   * answer inside it.
   *
   * This is the third state the step used to lack. Two quite different
   * things reach escrow from a Pokter wallet — an answer the agent gave
   * over A2A, and a receipt with nothing from the agent in it — and both
   * read as "Delivered: false, a Pokter wallet submitted it rather than
   * the agent", which says a buyer went unserved when one was served.
   * Job 97/1585 is the case that showed it.
   *
   * It still does not earn the step. The step certifies delivery from the
   * agent's own wallet, which is the thing a buyer hiring it directly is
   * relying on, and a courier delivery is not that. It is no longer
   * reported as a failure either.
   */
  deliveredViaPokter: boolean;
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

/**
 * How far a step got.
 *
 * `partial` is real evidence that falls short of what the step certifies,
 * and it exists because `earned: false` was carrying two meanings: nothing
 * happened, and something happened that this step does not credit. Only
 * `earned` advances the ladder, so a partial step changes what is said
 * without changing what is claimed.
 */
export type MaturityState = 'earned' | 'partial' | 'unmet';

export interface MaturityStep {
  id: MaturityId;
  label: string;
  /** True only for `state === 'earned'`. Kept for every reader that predates `state`. */
  earned: boolean;
  state: MaturityState;
  detail: string;
}

export interface AgentMaturity {
  /** The most advanced step earned, or null when none has been. */
  current: MaturityId | null;
  /**
   * The full statement, qualified. Published: the agent page's title, the
   * v1 API's `evidence.label` and the MCP server all read this, so the
   * qualifier stays here even where a chip cannot carry it.
   */
  label: string;
  /**
   * The same step, unqualified, for a chip with no room for more.
   *
   * It differs from `label` only when every delivery was team-funded, so
   * `label !== badge` is that fact where anything needs it. The catalogue
   * card carried it as a line of its own for a day and it was noise: no
   * agent has reached the rung above — "Proven in use" appeared zero
   * times across the whole catalogue — so the line fired on every
   * delivered card and distinguished none of them from each other. The
   * place that comparison belongs is the ladder on the agent's page,
   * which says it in full, and the funnel on the home page, which counts
   * team hires out.
   */
  badge: string;
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

/**
 * The third rung's other reading: the answer was delivered, by Pokter.
 *
 * A rung label, so it has to stay short enough to sit in a five-column
 * grid beside "Proven in use". The full sentence is the step's detail.
 */
export const DELIVERED_VIA_POKTER_LABEL = 'Delivered via Pokter';

/**
 * The qualifier both delivery states carry while no outside buyer has
 * settled anything.
 *
 * One constant rather than the same sentence written twice, because the two
 * states have to say it in the same words: it is the counterpart of the
 * proven-in-use step's "0/3 settled outside-team jobs from 0/3 buyer
 * wallets", and a delivery line that dropped it would claim a buyer Pokter
 * does not have. Who submitted and who paid are independent facts, and a
 * courier delivery on a team-funded job is both at once.
 */
export const TEAM_FUNDED_ONLY = 'all funded by Pokter’s team so far — no outside buyer has settled one yet.';

/** What each step means, for methodology and anywhere a step needs explaining. */
export const LADDER_MEANING: Record<MaturityId, string> = {
  answers: 'Answered Pokter’s checks of its published endpoint.',
  priced: 'A buyer can get current terms, signed by the agent’s wallet, that an escrow can pay.',
  delivered: 'At least one paid job delivered from the agent’s own wallet. Lifecycle demonstrations do not count, and nor does a delivery Pokter’s courier submitted — but a courier delivery carrying the agent’s own answer is reported as that rather than as nothing.',
  checked: 'Passed the latest answer check for its category: chain data for a live check, the published scenario for the others.',
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
   *
   * The qualifier belongs to the money, not to who submitted, so it is
   * computed once and applied to both readings of the step. A courier
   * delivery of the agent's own answer on a team-funded job is two
   * qualifications at once and has to carry both: dropping either would
   * describe a buyer Pokter does not have.
   */
  const noOutsideSettlement = facts.outsideTeam.completed === 0;
  const teamOnlyDeliveries = facts.delivered && noOutsideSettlement;
  const teamOnlyRelayed = facts.deliveredViaPokter && noOutsideSettlement;
  const earned: Record<MaturityId, boolean> = {
    answers: facts.reachable || (facts.probeRate === null && facts.liveAnswered === true),
    priced: facts.compatible,
    delivered: facts.delivered,
    checked: facts.tested,
    'proven-in-use': marketProven,
  };

  /*
   * Three readings of one rung, and only the first advances the ladder.
   * `partial` is the courier case: an answer the agent produced reached a
   * paying buyer, which is not nothing and is not the rung either.
   */
  const deliveredState: MaturityState = earned.delivered
    ? 'earned'
    : facts.deliveredViaPokter
      ? 'partial'
      : 'unmet';

  const steps: MaturityStep[] = [
    { id: 'answers', label: LABEL.answers, earned: earned.answers, state: earned.answers ? 'earned' : 'unmet', detail: facts.probeRate === null ? (facts.liveAnswered ? 'Answered the live check when this page loaded; no scheduled checks yet.' : 'Not checked yet.') : `Answered ${Math.round(facts.probeRate * 100)}% of Pokter’s checks.` },
    { id: 'priced', label: LABEL.priced, earned: earned.priced, state: earned.priced ? 'earned' : 'unmet', detail: earned.priced ? 'Signed, payable terms are available to a buyer.' : 'No current signed price an escrow can pay.' },
    {
      id: 'delivered',
      label: deliveredState === 'partial' ? DELIVERED_VIA_POKTER_LABEL : LABEL.delivered,
      earned: earned.delivered,
      state: deliveredState,
      detail: earned.delivered
        ? teamOnlyDeliveries
          ? `Agent submitted directly: paid jobs delivered from its own wallet, ${TEAM_FUNDED_ONLY}`
          : 'Agent submitted directly: a paid job delivered from the agent’s own wallet.'
        : deliveredState === 'partial'
          ? teamOnlyRelayed
            ? `Answer delivered via Pokter: the agent answered and a Pokter wallet submitted it to escrow, ${TEAM_FUNDED_ONLY} Nothing from the agent’s own wallet.`
            : 'Answer delivered via Pokter: the agent answered and a Pokter wallet submitted it to escrow. Nothing from the agent’s own wallet.'
          : facts.deliveredByOperator
            ? 'A delivery reached escrow, but a Pokter wallet submitted it rather than the agent.'
            : facts.hired
              ? 'Hired, with no delivery from the agent yet.'
              : 'No paid delivery yet.',
    },
    { id: 'checked', label: LABEL.checked, earned: earned.checked, state: earned.checked ? 'earned' : 'unmet', detail: earned.checked ? 'Passed the latest answer check for its category.' : 'No passing answer check on record.' },
    {
      id: 'proven-in-use',
      label: LABEL['proven-in-use'],
      earned: earned['proven-in-use'],
      state: earned['proven-in-use'] ? 'earned' : 'unmet',
      detail:
        `${facts.outsideTeam.completed}/${MARKET_PROVEN_COMPLETIONS} settled outside-team jobs from ${facts.outsideTeam.uniqueBuyers}/${MARKET_PROVEN_BUYERS} buyer wallets.` +
        (reliable ? ` Sustained: ${Math.floor(facts.observedDays)} observed days at ${Math.round((facts.outsideTeam.completionRate ?? 0) * 100)}% completion.` : ''),
    },
  ];

  const current = [...ORDER].reverse().find((id) => earned[id]) ?? null;
  const badge = current ? LABEL[current] : 'Not answering yet';
  const label = current === 'delivered' && teamOnlyDeliveries ? 'Delivered (team hires)' : badge;
  const summary = current
    ? LADDER_MEANING[current]
    : facts.probeRate === null
      ? 'Listed in the registry; Pokter has not checked it yet.'
      : 'Listed in the registry; it has not answered Pokter’s checks.';
  return { current, label, badge, summary, steps, sustained: reliable };
}
