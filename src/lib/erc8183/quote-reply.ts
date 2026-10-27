import { readA2AReply } from '@/lib/a2a/reply';
import { statedRefusal } from '@/lib/erc8183/refusal';

/*
 * Reading a seller's answer to a quote request: which part carries the
 * negotiation, and whether it declined. Kept apart from quote.ts, which
 * reaches the network, so the readers can be tested on recorded replies.
 */

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * The part of a reply that carries the negotiation, from a message or a
 * task alike: a completed reply's result, or what an input-required task
 * said in its status (where a seller states what it needs, or declines).
 * A failed or still-working task carries none.
 *
 * Any part, not only the first: the one with a negotiation hash, else one
 * with a negotiation response, else the first. An agent that led with a
 * summary part had its signed quote, in the second, read as no quote.
 */
export function responseData(payload: unknown): Record<string, unknown> | null {
  const reply = readA2AReply(payload);
  const parts = reply.state === 'completed' ? reply.dataParts : reply.state === 'input-required' ? reply.statusData : [];
  return parts.find((part) => typeof part.negotiation_hash === 'string') ?? parts.find((part) => object(part.response) !== null) ?? parts[0] ?? null;
}

/**
 * Whether a reply declined, and in what words, wherever the seller put it.
 *
 * BNB's agent SDK answers with a negotiation envelope whose refusal is
 * inside it: `response.accepted: false` with `response.reason` and
 * `response.reason_code`. Pokter read only the outer object, so "I need a
 * token address" came back as an unexplained "no quote", and the sweep's
 * second try with a concrete brief, which only follows a stated refusal,
 * never ran. An input-required task's status text is the seller saying
 * what it needs, which is a refusal of the question as asked.
 */
export function quoteRefusal(payload: unknown, data: Record<string, unknown> | null): { declined: boolean; stated: string | null } {
  const reply = readA2AReply(payload);
  const response = object(data?.response);
  const declined = data?.accepted === false || response?.accepted === false || data?.status === 'rejected' || reply.state === 'rejected';
  const stated =
    statedRefusal(data?.reason) ??
    statedRefusal(response?.reason) ??
    statedRefusal(response?.reason_code) ??
    (declined || reply.state === 'input-required' ? statedRefusal(reply.statusText) : null);
  return { declined: declined || stated !== null, stated };
}
