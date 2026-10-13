/**
 * What a delivered file shows.
 *
 * - `agent`: delivered by the agent itself, from its own wallet.
 * - `relayed`: the agent's own answer, carried to the job by Pokter's delivery
 *   agent; the file holds that answer and who gave it.
 * - `lifecycle`: Pokter's seller submitting a receipt with no answer from the
 *   agent in it. Early demonstrations did this to prove funding, delivery and
 *   settlement work; it shows nothing about whether the agent can do the task,
 *   and must never be presented as if it did.
 */
export type DeliveryKind = 'agent' | 'relayed' | 'lifecycle';

export function deliveryKind(producer: string | null, content: unknown): DeliveryKind {
  // Only Pokter's own delivery agent stands in for an agent. A builder's
  // Studio delivery ("Pokter verified provider") is the builder's own work,
  // merely hosted by Pokter.
  const fromPokterSeller = typeof producer === 'string' && /pokter delivery agent/i.test(producer);
  if (!fromPokterSeller) return 'agent';
  const object = content && typeof content === 'object' && !Array.isArray(content) ? (content as Record<string, unknown>) : null;
  return object && 'answer' in object && 'answered_by' in object ? 'relayed' : 'lifecycle';
}
