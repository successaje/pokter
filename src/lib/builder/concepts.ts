import type { Category } from '@/lib/agents/categories';
import type { DraftFields } from '@/lib/builder/drafts';

/**
 * Five agents worth building, for a builder who has not decided yet.
 *
 * "What should I build?" was answered with a grid of five category names
 * and a blank form, which is not an answer: a category is a shelf, not a
 * product. Each concept here names the customer, the task, what the
 * buyer has to supply, what comes back, the limit of what it can say, and
 * why somebody would pay for it. Without the customer and the limit a
 * builder cannot tell whether a concept is a business, and those are
 * exactly the two fields a category name leaves out.
 *
 * They are deliberately not five flavours of one idea. The buyer is a
 * different person in each — a leveraged borrower, somebody about to buy
 * an unfamiliar token, a treasurer who owes a monthly statement, a holder
 * of idle stablecoins, somebody about to commit to a range — and they
 * arrive at different moments, with different things in hand.
 *
 * Every one reads and reports. Pokter grants no agent authority over a
 * buyer's wallet, and the task templates all end "do not execute
 * transactions", so a concept that promised to act would be unbuildable
 * here. See `agents/categories`.
 */
export interface AgentConcept {
  id: string;
  /** Working title. Naming is offered, never required: see `nameSuggestions`. */
  title: string;
  nameSuggestions: string[];
  category: Category;
  protocol: 'a2a' | 'mcp';
  /** Who pays. A person at a moment, not a segment. */
  customer: string;
  /** What it does for them, in one sentence. */
  task: string;
  /** What the buyer must put in the brief for it to work at all. */
  inputs: string[];
  /** What comes back. */
  output: string;
  /** The honest edge of what it can say. */
  limitation: string;
  /** Why somebody would pay rather than look it up. */
  whyHire: string;
  /** The description the draft starts from, already inside the form's 40–600 limit. */
  description: string;
}

export const CONCEPTS: ReadonlyArray<AgentConcept> = [
  {
    id: 'token-screen',
    title: 'Pre-purchase token screen',
    nameSuggestions: ['Token Screen', 'Before You Buy', 'Contract Readout'],
    category: 'token-safety',
    protocol: 'a2a',
    customer: 'Somebody about to buy an unfamiliar BEP-20 token, with the address in their clipboard and two minutes of patience.',
    task: 'Reads the contract and reports what its owner can still do to a holder after the purchase.',
    inputs: ['One token contract address'],
    output: 'A pass, caution or fail verdict naming the functions behind it — sell taxes, blacklists, mint authority, ownership controls — and what it could not check.',
    limitation: 'It reads code and on-chain state. It cannot tell you whether the team is honest, and a contract that is safe today can be upgraded tomorrow if it says so.',
    whyHire: 'The brief is one address, so almost nobody fails to write it, and the answer is checkable against the same chain data the buyer can read. Both of those matter more than they sound.',
    description:
      'Inspects a BNB Chain token contract for sell taxes, blacklists, mint authority and ownership controls, and returns a read-only safety screen naming the functions it found and what it could not check. It does not judge the team or move funds.',
  },
  {
    id: 'liquidation-distance',
    title: 'Liquidation distance watch',
    nameSuggestions: ['Position Guardian', 'Liquidation Distance', 'Margin Readout'],
    category: 'health-factor',
    protocol: 'a2a',
    customer: 'A leveraged borrower on a BNB Chain lending market who knows their health factor moved and cannot tell how much room is left.',
    task: 'Reports a position’s health factor, what moved it, and the price move that would liquidate it.',
    inputs: ['A wallet address', 'Which lending market the position is on'],
    output: 'A risk report per position: current health factor, distance to liquidation in price terms, which asset is driving it, and the oracle the numbers came from.',
    limitation: 'It reports; it cannot protect. By the time a position is close, the thing that saves it is a transaction the borrower sends, and no agent here can send one for them.',
    whyHire: 'The number is on a dashboard already. What is not is "a 9% move in BNB liquidates you, and here is whose price feed says so" — and that is the sentence people pay for.',
    description:
      'Checks supported BNB Chain lending positions, explains what moved the health factor, and returns a read-only risk report giving the distance to liquidation and the oracle behind it. It does not move funds or promise liquidation protection.',
  },
  {
    id: 'treasury-statement',
    title: 'Monthly treasury statement',
    nameSuggestions: ['Treasury Reporter', 'Monthly Statement', 'Treasury Readout'],
    category: 'rebalancing',
    protocol: 'mcp',
    customer: 'The one person on a small team or DAO who has to tell everybody else where the money went this month.',
    task: 'Turns a set of treasury addresses into a sourced statement of balances, movements and protocol exposure.',
    inputs: ['One or more treasury addresses', 'The period to cover'],
    output: 'A statement separating observations from recommendations: balances now, material movements, where capital is deployed, and what changed since last time.',
    limitation: 'It sees what is on chain. Off-chain commitments, invoices and anything held on an exchange are invisible to it and are named as gaps rather than assumed to be zero.',
    whyHire: 'It is a recurring job with a deadline attached, which is the rarest thing an agent can be hired for. The same brief runs again every month.',
    description:
      'Produces a sourced BNB Chain treasury statement covering balances, material movements, protocol exposure and what changed since the last period, clearly separating observations from recommendations and naming what it could not see.',
  },
  {
    id: 'net-yield',
    title: 'Net yield at your size',
    nameSuggestions: ['Yield Researcher', 'Net of Costs', 'Yield Readout'],
    category: 'yield',
    protocol: 'a2a',
    customer: 'Somebody holding idle stablecoins who has been quoted three different APYs and suspects none of them are what they would actually get.',
    task: 'Compares yield routes for a specific amount, net of gas, fees, lockups and impermanent loss.',
    inputs: ['The amount and asset', 'How long it can be committed', 'Whether impermanent loss is acceptable'],
    output: 'A ranked comparison with the headline rate, the net rate at that size, the costs subtracted, and the assumptions each number rests on.',
    limitation: 'Every figure is a projection from current conditions. It states the assumptions rather than hiding them, and none of them is a promise about next week.',
    whyHire: 'The answer depends on the size of the position, and no public page knows the size of the position. That is the whole gap.',
    description:
      'Compares BNB Chain stablecoin yield routes for a stated amount and horizon, net of gas, fees, lockups and impermanent loss, and returns a read-only ranked comparison with the costs subtracted and every assumption named.',
  },
  {
    id: 'grid-sanity',
    title: 'Grid range sanity check',
    nameSuggestions: ['Grid Range Planner', 'Range Check', 'Before You Set It'],
    category: 'grid-trading',
    protocol: 'a2a',
    customer: 'Somebody about to commit capital to a grid range and wondering whether the range is wishful.',
    task: 'Checks a proposed range against how the market has actually moved, and says when it would break.',
    inputs: ['The pair', 'Lower and upper bound', 'Number of grids and the capital committed'],
    output: 'Grid parameters with a volatility scenario, the share of recent trading that fell inside the range, and the conditions under which the range fails.',
    limitation: 'It reports on a range before it is set. It cannot adjust one that is already running, and recent volatility is not a forecast.',
    whyHire: 'It is asked once, before money is committed, which is the one moment the answer can still change the decision.',
    description:
      'Reviews a proposed BNB Chain grid-trading range against recent volatility and returns read-only grid parameters with scenarios, the share of recent trading inside the range, and the conditions under which the range fails.',
  },
];

/**
 * How many concepts an assistant puts forward when there is no idea yet.
 *
 * Three, because the point is a decision rather than a catalogue: enough
 * for the choice to be real, few enough that each can carry its buyer, its
 * job and its limits without becoming a reading exercise. One of them is
 * recommended, so the builder can also decline to choose.
 *
 * Deliberately not `CONCEPTS.length`. `CONCEPTS` is Pokter's own picker,
 * where the cards are already written and a fifth costs nothing to scan;
 * this is the number an assistant should compose from scratch in a chat.
 * The two numbers drifted apart silently once — the prompt said three
 * while the style panel claimed five — so both now read from a named
 * constant and the panel reads from the list it actually renders.
 */
export const PROPOSED_CONCEPT_COUNT = 3;

/** The one to put forward, and the argument for it in plain words. */
export const RECOMMENDED_CONCEPT_ID = 'token-screen';

export const RECOMMENDATION_REASON =
  'Start with the token screen. Its brief is a single contract address, so buyers rarely fail to write one — and briefs a seller cannot use are where most hires here are lost. Its answer is checkable against the same chain data the buyer can read, so a record builds up rather than resting on trust. And it is asked before anybody holds the token, which is the earliest point at which an answer can still change what somebody does.';

export function conceptById(id: string): AgentConcept | null {
  return CONCEPTS.find((concept) => concept.id === id) ?? null;
}

/**
 * The concept as form fields, filling only what the builder has not.
 *
 * Nothing already typed is overwritten. A builder who named their agent
 * and then went looking for an idea must not have the name replaced by a
 * suggestion — being asked a second time for something already supplied
 * is the complaint this whole flow exists to answer, and quietly
 * discarding the answer is the same injury with the question removed.
 */
export function applyConcept(concept: AgentConcept, current: DraftFields): DraftFields {
  return {
    ...current,
    name: current.name.trim() || concept.nameSuggestions[0],
    description: current.description.trim() || concept.description,
    category: current.category.trim() || concept.category,
    protocol: concept.protocol,
  };
}
