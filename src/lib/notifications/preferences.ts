/**
 * What Pokter is allowed to put in somebody's inbox, and on whose say-so.
 *
 * Every send has to name the consent that permits it. Six exist, and
 * none of them is a licence for the others:
 *
 * - **job** — "tell me about job #1502". Given per job, and it covers that
 *   job's own state changes and nothing else.
 * - **agent-watch** — "tell me when this agent changes". Given per agent.
 * - **builder** — "tell me when my agents get work". Given per wallet, for
 *   work addressed to it.
 * - **campaign** — "remind me about Set and Earn". Given per inbox: deadline
 *   reminders, and, only if asked, a note when the one wallet it named
 *   hires another agent. It ends when the campaign does.
 * - **loan-watch** — "tell me before this Venus position is liquidated".
 *   Given per inbox and wallet, at a threshold the person chose.
 * - **trading-watch** — "tell me if tokens leave my trading wallet and do
 *   not come back". Given per inbox and wallet.
 *
 * There is no other consent that means "send me things", and that absence
 * is the point: a marketplace with one proven address per wallet is one
 * query away from a mailing list, and the only thing standing between the
 * two is that no stored row can be read as agreement to a broadcast.
 */

export type MailClass = 'job' | 'agent-watch' | 'builder' | 'campaign' | 'loan-watch' | 'trading-watch' | 'confirmation';

/**
 * The classes that need no stored consent.
 *
 * Exactly one: the mail that asks for consent. It cannot require what it
 * exists to obtain, and it carries nothing worth obtaining either way —
 * a confirmation names the job or the agent and holds no delivered answer,
 * no preview, and no figures.
 *
 * Everything else is listed above it rather than here. A future "your
 * dispute was decided" has to be added deliberately and argued for, not
 * slipped in under a consent somebody gave for something else.
 */
export const CONSENT_NOT_REQUIRED: readonly MailClass[] = ['confirmation'];

export interface StoredConsent {
  mailClass: MailClass;
  /** The job, agent or wallet it was given for. Never a wildcard. */
  subject: string;
}

/**
 * Whether a consent authorises one specific send.
 *
 * Both the class and the subject have to match. A buyer following job #1502
 * has not asked about #1503, and somebody watching one agent has not asked
 * about the rest of the catalogue.
 */
export function sendPermitted(consents: readonly StoredConsent[], send: { mailClass: MailClass; subject: string }): boolean {
  if (CONSENT_NOT_REQUIRED.includes(send.mailClass)) return true;
  return consents.some((c) => c.mailClass === send.mailClass && c.subject === send.subject);
}

/** What the buyer chose for work already running when they change address. */
export type AddressChangeChoice = 'move' | 'stop';

export interface RunningJob {
  chainId: number;
  jobId: string;
}

export interface AddressChangePlan {
  /** Jobs whose updates continue, at the new address. */
  move: RunningJob[];
  /** Jobs whose updates end. */
  stop: RunningJob[];
}

/**
 * What happens to running jobs when a proven address is replaced.
 *
 * Asked rather than assumed, because both answers are reasonable and
 * guessing wrong is a real cost either way: silently moving mail about a
 * live escrow to a new inbox is a disclosure the buyer did not ask for,
 * and silently dropping it loses the delivery notice on work they have
 * already paid for.
 *
 * Applied at verification, never at the claim. Until the new inbox has
 * confirmed, moving anything there would send mail to an address nobody
 * has proven.
 */
export function addressChangePlan(input: {
  running: readonly RunningJob[];
  choice: AddressChangeChoice;
  /** True when the address is not actually changing. */
  sameAddress?: boolean;
}): AddressChangePlan {
  if (input.sameAddress) return { move: [...input.running], stop: [] };
  return input.choice === 'move'
    ? { move: [...input.running], stop: [] }
    : { move: [], stop: [...input.running] };
}

/** Plain words for the choice, so both surfaces say the same thing. */
export function describeAddressChange(choice: AddressChangeChoice, running: number): string {
  if (running === 0) return 'No job is sending updates right now, so there is nothing to carry over.';
  const jobs = running === 1 ? '1 job' : `${running} jobs`;
  return choice === 'move'
    ? `${jobs} will keep sending updates, to the new address, once it is confirmed.`
    : `${jobs} will stop sending updates. The job pages still show every delivery and deadline.`;
}

/**
 * What a confirmed address link should say it did.
 *
 * Confirming an address is not subscribing to anything, and the job
 * confirmation copy ("you will get an email when a job you follow changes
 * state") would be false here — a buyer who had just proven an inbox and
 * subscribed to nothing would be told the opposite of their actual state.
 */
export function describeAddressConfirmed(counts: { moved: number; stopped: number }): { title: string; body: string } {
  const jobs = (n: number) => (n === 1 ? '1 job' : `${n} jobs`);
  if (counts.moved > 0) {
    return {
      title: 'Address confirmed',
      body: `${jobs(counts.moved)} now send their updates here. Any other job takes one click, from the job page.`,
    };
  }
  if (counts.stopped > 0) {
    return {
      title: 'Address confirmed',
      body: `${jobs(counts.stopped)} stopped sending updates, as you chose. Any job can start again in one click, from the job page.`,
    };
  }
  return {
    title: 'Address confirmed',
    body: 'Nothing is sending yet: confirming an address does not subscribe you to anything. Each job takes one click, from the job page.',
  };
}
