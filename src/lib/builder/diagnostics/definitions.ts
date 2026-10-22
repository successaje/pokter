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
    id: 'funded-jobs',
    label: 'Jobs an outside buyer funded',
    counts:
      'Escrow jobs attributed to this agent whose funder is not one of Pokter’s declared wallets and is not the agent’s own provider wallet. Lifecycle demonstrations are excluded.',
    window: ALL_TIME,
    denominator: null,
    source: 'Pokter’s job index, read back from the escrow contract.',
  },
  {
    id: 'delivered-and-settled',
    label: 'Delivered and settled',
    counts: 'Outside-funded jobs that were delivered and settled.',
    window: ALL_TIME,
    denominator: 'Outside-funded jobs that reached an end state.',
    source: 'Job statuses read back from the escrow contract.',
  },
  {
    id: 'deliveries-that-failed',
    label: 'Deliveries that failed',
    counts:
      'Funded jobs this agent owed and did not deliver: left to lapse past the deadline, refused when notified, or disputed and refunded. Counted over EVERY funded job, Pokter’s own test hires included — a funded job an agent let lapse is a fact about the agent whoever paid for it. Jobs a Pokter wallet was the provider for are excluded, because Pokter owed those deliveries.',
    window: ALL_TIME,
    /*
     * Deliberately not a share of the row above. The two have different
     * populations — one outside-funded, one all-funded — and stating a
     * single denominator over both printed "Delivered and settled: 0 of 0"
     * beside a lapsed job.
     */
    denominator: null,
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
  'Asks refused for a brief over the 2,000-character limit. That check runs before the agent is loaded, so there is no agent to attribute the refusal to, and moving a pure-input check behind a network call would be a worse trade than leaving this gap. Shorter briefs refused by the length floor ARE recorded, so the two input refusals are deliberately asymmetric.',
  /*
   * The reason here has to be the one that is true, because the wrong one
   * invites the work that would not help. Pokter *does* read negotiation
   * hashes back off chain — `jobIdentity` does it for every job in the
   * reference format, and it is how such a job is attributed to an agent at
   * all. So "Pokter does not read it back" was both false today and an
   * invitation to go and build the thing that already exists.
   *
   * What makes the gap unmeasurable is that the hash is written into a job
   * description, and a job description exists only once somebody has funded
   * one. The join is therefore available for exactly the prices that were
   * funded and impossible for exactly the prices this figure would have
   * been about. That is a fact about the escrow, not a gap in Pokter.
   */
  'How many buyers got a price and then did not fund. Pokter records the prices it signs and the jobs that get funded, but cannot join the two where it would matter. A signed quote carries no buyer, and the only thing tying one to a job is the negotiation hash in that job’s description on chain — which exists only once the job has been funded. Pokter reads that hash back for the jobs that exist, and that is how each one is attributed to an agent; for a price nobody funded there is no job, so there is nothing to read. Subtracting one count from the other was tried and removed — over a fixed window it counts jobs funded from prices signed before it, so it answered a question nobody asked.',
  'Whether an ask came from Pokter itself. Scheduled checks and free trials are excluded by the path they arrive on, and funded jobs by the wallet that paid — but a person at Pokter opening the hire page is indistinguishable from any other buyer, because no wallet or identity is attached to an ask. Treat a handful of asks with that in mind.',
  'Who the buyers were. No wallet, address or identifier is attached to a price request, so there is no count of distinct buyers before funding — only of asks.',
  'Why a buyer left before asking for a price. Pokter records that the hire page was opened, not what was read or where attention went.',
  'What happened inside the buyer’s wallet. A rejection, a missing balance or a failed transaction is signed on the buyer’s device and never reaches Pokter, so a price that was never funded cannot be split into "they changed their mind" and "they could not pay".',
  'The brief. It is deliberately never stored against an attempt, so refusals cannot be grouped by what was asked for.',
  'Search impressions and listing ranking. Pokter has no impression instrumentation, so there is no measure of how often this agent was shown and passed over.',
];
