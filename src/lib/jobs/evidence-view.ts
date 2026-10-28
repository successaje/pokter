/**
 * One escrow job as public evidence, and the rule for what of it is
 * published.
 *
 * Everything about a job that the chain already says — its network, its
 * escrow, the agent, the amount and token, when it was delivered, the hash
 * it committed to, how it ended — is published for every job Pokter
 * indexed, with Pokter's own check of the delivery beside it. What the
 * buyer wrote and what came back is theirs: it is shown only for jobs
 * Pokter's own team funded as tests, and withheld for every other buyer,
 * including a builder hiring their own agent, until a buyer can choose to
 * publish it. The buyer's address is never shown, as the receipts API
 * never returns it; a team wallet is published, so it is named.
 *
 * A job whose funder cannot be read is treated as an outside buyer's. The
 * published team list counts a job with no recorded client as the team's,
 * which is right for a total and wrong here: it would publish a stranger's
 * brief on a guess.
 */

export type JobFunder = 'team' | 'self' | 'outside' | 'unknown';

const ZERO = '0x0000000000000000000000000000000000000000';

export function jobFunder(job: { client: string | null | undefined; provider: string | null | undefined }, team: ReadonlySet<string>): JobFunder {
  const client = job.client?.toLowerCase();
  if (!client || client === ZERO) return 'unknown';
  if (team.has(client)) return 'team';
  if (job.provider && client === job.provider.toLowerCase()) return 'self';
  return 'outside';
}

/** Whether the brief and the delivered answer are published. Only for Pokter's own test jobs. */
export function briefIsPublic(funder: JobFunder): boolean {
  return funder === 'team';
}

export const FUNDER_LABEL: Record<JobFunder, string> = {
  team: 'Pokter’s team, as a test',
  self: 'The agent’s own operator (a self-hire)',
  outside: 'An outside buyer',
  unknown: 'Not readable just now',
};

/** The escrow's state in words, for anyone reading — not only the buyer or the agent. */
export const JOB_STATUS_WORDS: Record<string, { label: string; meaning: string }> = {
  OPEN: { label: 'Created, not funded', meaning: 'The job exists in the escrow, but no money has been put in it.' },
  FUNDED: { label: 'Funded, awaiting delivery', meaning: 'The buyer’s money is in escrow. The agent has not delivered yet.' },
  SUBMITTED: { label: 'Delivered', meaning: 'The agent submitted its delivery. The money stays in escrow until the review window closes and someone settles it, or a dispute succeeds.' },
  COMPLETED: { label: 'Completed, agent paid', meaning: 'The job was settled and the escrow paid the agent.' },
  REJECTED: { label: 'Rejected, buyer refunded', meaning: 'A dispute reached its quorum and settling the job refunded the buyer.' },
  EXPIRED: { label: 'Expired, buyer refunded', meaning: 'The deadline passed and the buyer reclaimed the money.' },
};

/**
 * The status in words. `paidToCourier`: the escrow's provider is Pokter's
 * courier, not the agent, so a settled job paid Pokter. "Completed, agent
 * paid" was said of jobs 97/1586 and 97/1587, whose escrow paid Pokter's
 * operator key while the agents, Sluicegate and Keel, received nothing.
 */
export function jobStatusWords(status: string, paidToCourier = false): { label: string; meaning: string } {
  if (paidToCourier && status === 'COMPLETED') {
    return { label: 'Completed, paid to Pokter’s courier', meaning: 'The job was settled and the escrow paid Pokter’s courier, which delivered the agent’s answer on its behalf. The agent was not paid by this escrow.' };
  }
  return JOB_STATUS_WORDS[status] ?? { label: status, meaning: 'A state Pokter does not describe.' };
}

/** The public evidence page for a job: one per escrow job, chain and id. */
export function jobEvidencePath(job: { chainId: number; jobId: string }): string {
  return `/jobs/${job.chainId}/${job.jobId}`;
}

/** Whether the escrow says the agent delivered. */
export function wasDelivered(status: string): boolean {
  return status === 'SUBMITTED' || status === 'COMPLETED' || status === 'REJECTED';
}

/** "26 Oct 2026, 20:39 UTC": a moment with its year, since evidence is read long after. */
export function utcWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
}

/**
 * When the job was funded, as far as Pokter knows it. `hiredAt` is when
 * Pokter recorded the job, which for a job indexed later can fall after
 * its own delivery (job 1444: recorded 14 Oct 01:19, delivered 13 Oct
 * 22:46). The chain does not keep a funding time Pokter reads here, so
 * a record later than the delivery says only what is certain.
 */
export function fundedWhen(hiredAt: string, deliveredAt: string | null): string {
  const recorded = utcWhen(hiredAt);
  if (!recorded) return 'Not recorded';
  if (deliveredAt && Date.parse(hiredAt) > Date.parse(deliveredAt)) return `Before it was delivered. Pokter recorded the job later, ${recorded}.`;
  return `${recorded}, as Pokter recorded it`;
}

/** What a buyer's own address reads as, inside an answer shown for anyone else's job. */
export const BUYER_WALLET = '[buyer’s wallet]';

/**
 * A delivered answer as it may be published: the agent's work in full,
 * with the buyer's own address taken out unless the job is Pokter's own
 * test. Answers repeat what they were sent — "wallet 0x…, health factor
 * 1.48" — so withholding the brief alone still tied a wallet to its hire
 * and its finances, which the receipts API never does. The hash is
 * checked on the original bytes; this is only what is shown.
 */
export function publishableAnswerText(text: string, funder: JobFunder, client: string | null | undefined): string {
  if (briefIsPublic(funder) || !client || !/^0x[0-9a-fA-F]{40}$/.test(client)) return text;
  return text.replace(new RegExp(`0x${client.slice(2)}`, 'gi'), BUYER_WALLET);
}
