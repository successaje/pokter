import { ATTEMPT_WINDOW_DAYS } from './attempt';

/**
 * What every figure on the diagnostics panel counts, over what window, and
 * against what denominator.
 *
 * Shipped as data and rendered beside the numbers rather than written into
 * the copy, because a rate whose denominator is only in somebody's head is
 * not a measurement. "60% of hires fail" is unreadable without knowing
 * whether the 100% is attempts, buyers, sessions or jobs — and the four
 * give very different answers on the same agent.
 *
 * `denominator: null` marks a plain count. That is a statement too: it says
 * this number is not a rate and must not be read as one.
 */

export interface MetricDefinition {
  id: string;
  label: string;
  /** What one unit of this number is. */
  counts: string;
  /** The time window, stated in days and in how days are cut. */
  window: string;
  /** What it is a share of, or null when it is a count. */
  denominator: string | null;
  /** Which store the number is read from. */
  source: string;
}

const WINDOW = `The last ${ATTEMPT_WINDOW_DAYS} days, cut into UTC days.`;
const ALL_TIME = 'Every job Pokter has indexed for this agent, with no cutoff.';

export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  {
    id: 'hire-flow-opens',
    label: 'Hire flow opened',
    counts:
      'Tab sessions in which the hire page for this agent was opened. One per tab per day at most, and not one per person: the same buyer in a second tab counts twice.',
    window: WINDOW,
    denominator: null,
    source: 'The daily aggregate funnel (no visitor id, wallet, IP or brief is kept).',
  },
  {
    id: 'buyer-attempts',
    label: 'Buyer price requests',
    counts:
      'Distinct asks for a price through the hire flow. One ask is one network address, one brief and one UTC day, so pressing the button again after a timeout is the same ask. An edited brief is a new ask.',
    window: WINDOW,
    denominator: null,
    source: 'Recorded server-side by the hire quote endpoint. Pokter’s scheduled checks never reach it.',
  },
  {
    id: 'buyer-attempts-quoted',
    label: 'Asks that got a signed price',
    counts: 'Buyer price requests where the agent returned a price signed by its registered wallet.',
    window: WINDOW,
    denominator: 'Buyer price requests in the same window.',
    source: 'The same endpoint, from the quote it verified.',
  },
  {
    id: 'buyer-attempts-stopped',
    label: 'Asks that stopped',
    counts:
      'Buyer price requests that ended without a usable signed price, grouped by the refusal code the hire flow returned.',
    window: WINDOW,
    denominator: 'Buyer price requests in the same window.',
    source: 'The same endpoint, from the failure it classified.',
  },
  {
    id: 'signed-prices',
    label: 'Prices carried to funding',
    counts:
      'Signed quotes Pokter recorded for this agent on the way to a funding call — one per negotiation hash, so a buyer who edits and re-asks records another.',
    window: WINDOW,
    denominator: null,
    source: 'The quote intents Pokter writes before a buyer funds.',
  },
  {
    id: 'funded-jobs',
    label: 'Jobs an outside buyer funded',
    counts:
      'Escrow jobs attributed to this agent whose funder is not one of Pokter’s declared wallets and is not the agent’s own provider wallet. Lifecycle demonstrations are excluded.',
    window: ALL_TIME,
    denominator: null,
    source: 'Pokter’s job index, read back from the escrow contract.',
  },
  {
    id: 'delivery-outcomes',
    label: 'Delivery outcomes',
    counts:
      'Outside-funded jobs that reached an end state: delivered and settled, refused when notified, disputed, or left to lapse past the deadline.',
    window: ALL_TIME,
    denominator: 'Outside-funded jobs that reached an end state.',
    source: 'Job statuses from the escrow, plus what the seller said when told a job was funded.',
  },
];

/**
 * What a builder may reasonably expect to see here and will not find,
 * because Pokter does not measure it.
 *
 * Listed rather than left blank. An absent row on a diagnostics panel
 * reads as a zero, and a zero is a claim.
 */
export const UNMEASURED: readonly string[] = [
  'Who the buyers were. No wallet, address or identifier is attached to a price request, so there is no count of distinct buyers before funding — only of asks.',
  'Why a buyer left before asking for a price. Pokter records that the hire page was opened, not what was read or where attention went.',
  'What happened inside the buyer’s wallet. A rejection, a missing balance or a failed transaction is signed on the buyer’s device and never reaches Pokter, so a price that was never funded cannot be split into "they changed their mind" and "they could not pay".',
  'The brief. It is deliberately never stored against an attempt, so refusals cannot be grouped by what was asked for.',
  'Search impressions and listing ranking. Pokter has no impression instrumentation, so there is no measure of how often this agent was shown and passed over.',
];
