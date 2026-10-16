import { readA2AReply } from '@/lib/a2a/reply';

import { statedDeliverableUrl } from './stated-url';

/**
 * What a seller's answer to notify_funded says, in Pokter's three words.
 *
 * The reference pattern answers { status: "accepted" | "rejected" }. A
 * seller that does the work before answering may instead report what it
 * did: Brain on BNB answered job 57016 with the job's on-chain status
 * ("SUBMITTED"), already_delivered: true, its deliverable URL and the
 * whole result, seconds after funding. Pokter read that as no answer and
 * told the buyer the agent "could not be reached", for a job already
 * delivered, and dropped the URL it was handed.
 *
 * A reply saying the job is delivered is the strongest acceptance there
 * is. Anything else that names neither outcome stays unreadable.
 */
const DELIVERED = new Set(['submitted', 'completed', 'delivered']);

export function readNoticeReply(reply: Record<string, unknown> | null): { status: 'accepted' | 'rejected'; reason: string | null; deliverableUrl: string | null } | null {
  if (!reply) return null;
  const reason = typeof reply.reason === 'string' ? reply.reason.trim().slice(0, 500) || null : null;
  const status = typeof reply.status === 'string' ? reply.status.trim().toLowerCase() : '';
  if (status === 'accepted' || status === 'rejected') return { status, reason, deliverableUrl: statedDeliverableUrl(reply) };
  if (reply.already_delivered === true || reply.alreadyDelivered === true || DELIVERED.has(status)) {
    return { status: 'accepted', reason, deliverableUrl: statedDeliverableUrl(reply) };
  }
  return null;
}

/**
 * The seller's answer out of the JSON-RPC payload.
 *
 * Usually the answer is an A2A message or task, with the data in its parts.
 * Brain on BNB returns it as the bare JSON-RPC result instead: an object
 * with job_id, a string status, already_delivered and the deliverable URL,
 * and no parts. The A2A reader found no parts and so no data, which is why
 * #140 still read job 57016's answer as no answer. A bare result with
 * neither parts nor a kind is taken as the answer itself.
 */
export function noticeReplyData(payload: unknown): Record<string, unknown> | null {
  const data = readA2AReply(payload).data;
  if (data) return data;
  const root = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
  const result = root?.result && typeof root.result === 'object' && !Array.isArray(root.result) ? (root.result as Record<string, unknown>) : null;
  if (!result || 'parts' in result || 'kind' in result || 'artifacts' in result) return null;
  return result;
}
