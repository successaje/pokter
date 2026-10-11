/**
 * The pure halves of the courier: which skill to ask for, and what counts as
 * an answer. Kept free of fetches so they are tested without an agent.
 */

export interface SkillChoice {
  id: string;
  name: string;
}

/*
 * Skills that are plumbing rather than work. Never the one a brief is sent
 * to. Matched loosely because agents name them freely: "negotiate",
 * "negotiate-erc8183-job", "notify_funded", "notifyFunded".
 */
const PLUMBING = /negotiat|notify|^quote$|^ping$|^health$|^healthcheck$|^status$/i;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * The skill a brief is sent to: the first one the card declares that is not
 * plumbing. Null when the card declares nothing usable, which the caller
 * treats as "cannot be asked", not as "ask anyway".
 */
export function pickWorkSkill(skills: unknown): SkillChoice | null {
  if (!Array.isArray(skills)) return null;
  for (const entry of skills) {
    const skill = object(entry);
    const id = typeof skill?.id === 'string' ? skill.id : typeof skill?.name === 'string' ? skill.name : null;
    if (!id || PLUMBING.test(id)) continue;
    return { id, name: typeof skill?.name === 'string' ? skill.name : id };
  }
  return null;
}

export interface AgentAnswer {
  /** Prose the agent returned, joined, when any part was text. */
  text: string | null;
  /** Structured content the agent returned, when any part was data. */
  data: Record<string, unknown> | null;
}

/**
 * A price, not the work.
 *
 * Agents that sell their work answer a message with a signed quote and do
 * the work only once an escrow is funded. A quote carried back as "the
 * answer" would deliver a price to a buyer who paid for an assessment.
 */
export function isQuoteReply(value: unknown): boolean {
  const record = object(value);
  if (!record) return false;
  return (
    typeof record.negotiation_hash === 'string' ||
    typeof record.provider_sig === 'string' ||
    record.status === 'quoted' ||
    (object(record.response) !== null && typeof object(record.response)?.accepted === 'boolean' && 'price' in record)
  );
}

/**
 * What the agent said, out of an A2A `message/send` result: the text parts
 * joined, and the first data part. Parts are read from the reply message,
 * from a task's status message, and from a task's artifacts, where many
 * agents put their output. A reply with neither text nor data, an error,
 * or a price quote is not an answer, and the courier does not deliver it.
 */
export function extractAnswer(payload: unknown): AgentAnswer | null {
  const root = object(payload);
  if (!root || root.error) return null;
  const result = object(root.result);
  if (!result || isQuoteReply(result)) return null;

  const parts: unknown[] = [];
  const statusMessage = object(object(result.status)?.message);
  for (const source of [result, statusMessage]) {
    if (source && Array.isArray(source.parts)) parts.push(...source.parts);
  }
  if (Array.isArray(result.artifacts)) {
    for (const artifact of result.artifacts) {
      const value = object(artifact);
      if (value && Array.isArray(value.parts)) parts.push(...value.parts);
    }
  }

  const texts: string[] = [];
  let data: Record<string, unknown> | null = null;
  for (const entry of parts) {
    const part = object(entry);
    if (!part) continue;
    if (typeof part.text === 'string' && part.text.trim()) texts.push(part.text.trim());
    if (!data) {
      const candidate = object(part.data);
      if (candidate && Object.keys(candidate).length > 0 && !isQuoteReply(candidate)) data = candidate;
    }
  }
  if (texts.length === 0 && !data) return null;
  return { text: texts.length ? texts.join('\n\n') : null, data };
}
