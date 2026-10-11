/**
 * The pure halves of the courier: which skill to ask for, and what counts as
 * an answer. Kept free of fetches so they are tested without an agent.
 */

export interface SkillChoice {
  id: string;
  name: string;
}

/* Skills that are plumbing rather than work. Never the one a brief is sent to. */
const PLUMBING = new Set(['negotiate', 'notify_funded', 'quote', 'health', 'ping']);

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
    if (!id || PLUMBING.has(id.toLowerCase())) continue;
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
 * What the agent said, out of an A2A `message/send` result: the text parts
 * joined, and the first data part. An answer with neither is not an answer,
 * and the courier does not deliver it.
 */
export function extractAnswer(payload: unknown): AgentAnswer | null {
  const root = object(payload);
  if (root?.error) return null;
  const result = object(root?.result);
  /* Some agents wrap the message in a task; the last message's parts are the reply. */
  const message = object(result?.status) ? object(object(result?.status)?.message) : result;
  const parts = Array.isArray(message?.parts) ? message.parts : Array.isArray(result?.parts) ? result.parts : [];
  const texts: string[] = [];
  let data: Record<string, unknown> | null = null;
  for (const entry of parts) {
    const part = object(entry);
    if (!part) continue;
    if (typeof part.text === 'string' && part.text.trim()) texts.push(part.text.trim());
    if (!data) {
      const candidate = object(part.data);
      if (candidate && Object.keys(candidate).length > 0) data = candidate;
    }
  }
  if (texts.length === 0 && !data) return null;
  return { text: texts.length ? texts.join('\n\n') : null, data };
}
