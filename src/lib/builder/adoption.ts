/**
 * How close a builder's agent is to the campaign's adoption bar.
 *
 * BNB asks for two separate things and the page used to show both as a
 * hard-coded zero:
 *
 *   - three completed hires from three distinct wallets that are neither
 *     yours nor funded by yours
 *   - at least five onchain actions by the agent, across three separate days
 *
 * They are counted from different sources and only one of them is about
 * buyers, so they are kept apart here. A builder staring at "0 / 3" and
 * "0 / 5" cannot tell whether nobody has hired them or whether the hires
 * happened and something else is missing — which is exactly the situation
 * on Pokter today, where agents are hired and still perform no actions.
 */

/** A completed hire of this agent, as read from the escrow contract. */
export interface AdoptionHire {
  jobId: string;
  /** The wallet that funded the escrow. */
  client: string;
  completedAtMs: number;
}

/** An onchain action performed by the agent's own wallet. */
export interface AgentAction {
  atMs: number;
}

export interface AdoptionProgress {
  /** Distinct funding wallets, before the owner is excluded. */
  distinctWallets: number;
  /** Distinct wallets that are not the owner's own. */
  independentWallets: number;
  independentTarget: number;
  hiresMet: boolean;

  actions: number;
  actionsTarget: number;
  actionsMet: boolean;

  /** Separate UTC days carrying at least one action. */
  activeDays: number;
  daysTarget: number;
  daysMet: boolean;

  /** Hires Pokter saw but discounted because the owner funded them. */
  selfFunded: number;
}

export const INDEPENDENT_WALLETS_TARGET = 3;
export const ACTIONS_TARGET = 5;
export const ACTIVE_DAYS_TARGET = 3;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Counts what can be counted, and does not guess at the rest.
 *
 * A wallet belonging to the owner is excluded — that much is checkable from
 * the addresses in hand. "Not funded by yours" is not: establishing it means
 * tracing where each buyer's balance came from, which Pokter does not index
 * and should not pretend to. The caller states that limit rather than
 * quietly reporting a number BNB will compute differently.
 *
 * Days are counted in UTC, because the campaign's own deadline is, and two
 * actions either side of a local midnight must not count as two days in one
 * reader's timezone and one in another's.
 */
export function summariseAdoption(input: {
  hires: AdoptionHire[];
  actions: AgentAction[];
  ownerAddresses: string[];
}): AdoptionProgress {
  const owners = input.ownerAddresses.filter(Boolean);
  const isOwned = (wallet: string) => owners.some((owner) => same(owner, wallet));

  const distinct = new Set(input.hires.map((hire) => hire.client.toLowerCase()));
  const independent = new Set(
    input.hires
      .filter((hire) => !isOwned(hire.client))
      .map((hire) => hire.client.toLowerCase()),
  );

  const days = new Set(
    input.actions.map((action) =>
      new Date(action.atMs).toISOString().slice(0, 10),
    ),
  );

  return {
    distinctWallets: distinct.size,
    independentWallets: independent.size,
    independentTarget: INDEPENDENT_WALLETS_TARGET,
    hiresMet: independent.size >= INDEPENDENT_WALLETS_TARGET,

    actions: input.actions.length,
    actionsTarget: ACTIONS_TARGET,
    actionsMet: input.actions.length >= ACTIONS_TARGET,

    activeDays: days.size,
    daysTarget: ACTIVE_DAYS_TARGET,
    daysMet: days.size >= ACTIVE_DAYS_TARGET,

    selfFunded: distinct.size - independent.size,
  };
}
