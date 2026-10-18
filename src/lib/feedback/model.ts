/**
 * The question asked after a delivery: did it answer what you hired it for?
 *
 * Private, never a public review, never required and never a key to
 * anything. One answer per job, from the wallet that funded it, which may
 * change its answer. Agreeing to a follow-up is a separate, unticked
 * choice, and a contact is kept only when it is ticked: an operational
 * notification address is never reused for research.
 */
export const USEFUL_ANSWERS = ['yes', 'partly', 'no'] as const;
export type UsefulAnswer = (typeof USEFUL_ANSWERS)[number];

export interface JobFeedbackContent {
  answered: UsefulAnswer;
  reason: string;
  followUp: boolean;
  contact: string;
}

export const REASON_MAX = 500;
export const CONTACT_MAX = 200;

export function feedbackMessage(input: { chainId: number; jobId: string; content: JobFeedbackContent }): string {
  const c = normaliseFeedback(input.content);
  return [
    'Pokter private job feedback',
    `Escrow chain: ${input.chainId}`,
    `ERC-8183 job: ${input.jobId}`,
    `Answered the question: ${c.answered}`,
    `Reason: ${c.reason || '(none)'}`,
    `Open to a follow-up: ${c.followUp ? 'yes' : 'no'}`,
    `Contact: ${c.followUp && c.contact ? c.contact : '(none)'}`,
  ].join('\n');
}

/** Trimmed, and the contact dropped unless a follow-up was agreed to. */
export function normaliseFeedback(content: JobFeedbackContent): JobFeedbackContent {
  const followUp = content.followUp === true;
  return {
    answered: content.answered,
    reason: content.reason.trim().slice(0, REASON_MAX),
    followUp,
    contact: followUp ? content.contact.trim().slice(0, CONTACT_MAX) : '',
  };
}

export function validFeedbackContent(value: unknown): value is JobFeedbackContent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<JobFeedbackContent>;
  return (
    typeof v.answered === 'string' && (USEFUL_ANSWERS as readonly string[]).includes(v.answered) &&
    typeof v.reason === 'string' && v.reason.length <= REASON_MAX * 2 &&
    typeof v.followUp === 'boolean' &&
    typeof v.contact === 'string' && v.contact.length <= CONTACT_MAX * 2
  );
}
