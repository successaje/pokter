/**
 * Set and Earn's build entry, kept separate from being hireable.
 *
 * A builder saying "I also want to enter Set and Earn" is adding an
 * optional goal, not raising the bar on their agent. The two are
 * genuinely different: the campaign requires the agent to perform its own
 * on-chain actions in its own category, and a read-only reporting agent —
 * the kind Pokter's own templates produce, and the kind most buyers here
 * hire — cannot do that and is none the worse as a product. Folding the
 * campaign's rules into the readiness ladder would tell such a builder
 * that their working, paid, settled agent is unfinished.
 *
 * So the rules live here, the readiness milestones live in
 * `diagnostic/builder-lifecycle`, and neither reads the other.
 *
 * Every requirement below is BNB Chain's, not Pokter's, and
 * `CAMPAIGN_RULES_URL` is the authority. Each one records whether Pokter
 * can verify it at all, because three of the five campaign tasks happen
 * in the builder's own wallet and repository, which Pokter does not
 * watch — see `campaign/progress`.
 */

import { ACTIONS_TARGET, ACTIVE_DAYS_TARGET, INDEPENDENT_WALLETS_TARGET } from '@/lib/builder/adoption';

export type QualificationVisibility = 'pokter-verifies' | 'builder-declares' | 'bnb-decides';

export interface BuildQualificationItem {
  id:
    | 'registered-wallet'
    | 'listed-after-phase-2'
    | 'identity-owned'
    | 'card-and-category'
    | 'answers-probes'
    | 'public-repository'
    | 'independent-hirers'
    | 'onchain-actions'
    | 'actions-match-category';
  requirement: string;
  /** What it means in practice, including the part people get wrong. */
  note: string;
  visibility: QualificationVisibility;
  /**
   * Whether an agent that only reads and reports can meet it.
   *
   * False on the execution requirements, and said out loud: a reporting
   * agent is useful and hireable and will never satisfy them, and a
   * builder deserves to know that before they spend two days trying.
   */
  reachableByReadOnlyAgent: boolean;
}

export const BUILD_QUALIFICATION: ReadonlyArray<BuildQualificationItem> = [
  {
    id: 'registered-wallet',
    requirement: 'Registered on BNB Chain’s form before anything else',
    note: 'Actions from unregistered wallets are not counted, including ones already made. One wallet per person, and a Pokter passkey wallet cannot be it.',
    visibility: 'builder-declares',
    reachableByReadOnlyAgent: true,
  },
  {
    id: 'listed-after-phase-2',
    requirement: 'Registered after the Phase 2 announcement',
    note: 'An agent that existed before the announcement does not count, and nor do cosmetic clones or the same agent under several IDs.',
    visibility: 'pokter-verifies',
    reachableByReadOnlyAgent: true,
  },
  {
    id: 'identity-owned',
    requirement: 'An ERC-8004 identity owned by the registered wallet',
    note: 'Ownership cannot be moved to the campaign wallet afterwards from inside Pokter, so publish from that wallet.',
    visibility: 'pokter-verifies',
    reachableByReadOnlyAgent: true,
  },
  {
    id: 'card-and-category',
    requirement: 'A resolvable agent card stating its category',
    note: 'The same card Pokter reads for the Built milestone. A category it does not act in fails the last requirement below.',
    visibility: 'pokter-verifies',
    reachableByReadOnlyAgent: true,
  },
  {
    id: 'answers-probes',
    requirement: 'Answering when probed',
    note: 'The same public endpoint check as the readiness ladder’s second milestone.',
    visibility: 'pokter-verifies',
    reachableByReadOnlyAgent: true,
  },
  {
    id: 'public-repository',
    requirement: 'A public source repository',
    note: 'Optional for Pokter, required for a campaign build entry.',
    visibility: 'builder-declares',
    reachableByReadOnlyAgent: true,
  },
  {
    id: 'independent-hirers',
    requirement: `${INDEPENDENT_WALLETS_TARGET} independent wallets hire it`,
    note: 'Distinct external wallets, not funded by yours. Your own test hire is not one of them, and wallets hiring each other in circles are excluded. Pokter can exclude wallets it knows are yours; it cannot trace where a stranger’s balance came from.',
    visibility: 'bnb-decides',
    reachableByReadOnlyAgent: true,
  },
  {
    id: 'onchain-actions',
    requirement: `${ACTIONS_TARGET} on-chain actions from the agent’s own wallet, across ${ACTIVE_DAYS_TARGET} separate days`,
    note: 'A hire through Pokter returns a written deliverable, which is not an on-chain action. The earliest finish is two days after the first action.',
    visibility: 'pokter-verifies',
    reachableByReadOnlyAgent: false,
  },
  {
    id: 'actions-match-category',
    requirement: 'Those actions match the declared category',
    note: 'A yield agent touching lending or vault contracts, a grid agent trading repeatedly, a rebalancing agent adjusting positions.',
    visibility: 'bnb-decides',
    reachableByReadOnlyAgent: false,
  },
];

/** The requirements a read-only reporting agent cannot meet, however good it is. */
export const EXECUTION_ONLY_REQUIREMENTS = BUILD_QUALIFICATION.filter(
  (item) => !item.reachableByReadOnlyAgent,
).map((item) => item.id);

/**
 * What a campaign entry asks for that being hireable does not.
 *
 * Stated as a difference rather than a longer list, because the thing a
 * builder needs to hear is that the ladder they just finished was not
 * incomplete.
 */
export const CAMPAIGN_IS_SEPARATE =
  'Being hireable on Pokter and qualifying for Set and Earn are different things. An agent that reads and reports can finish every readiness milestone, be hired and be paid, and still never satisfy the campaign’s on-chain execution requirements. Nothing here adds trading to your agent, and a hire you fund yourself counts for neither.';
