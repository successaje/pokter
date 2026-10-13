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

/*
 * "health" and "status" are also what a health-factor or position agent
 * calls its real work: one agent's only work skill is `health`, a "Position
 * health report", and treating it as a liveness ping marked the agent as
 * having nothing to ask. Those two ids are plumbing only when the skill's
 * own name and description do not describe work.
 */
const AMBIGUOUS = /^(health|status)$/i;
const DESCRIBES_WORK = /position|factor|lending|loan|liquidat|collateral|portfolio|report|range/i;

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
    if (!id) continue;
    if (PLUMBING.test(id)) {
      const words = `${typeof skill?.name === 'string' ? skill.name : ''} ${typeof skill?.description === 'string' ? skill.description : ''}`;
      if (!(AMBIGUOUS.test(id) && DESCRIBES_WORK.test(words))) continue;
    }
    return { id, name: typeof skill?.name === 'string' ? skill.name : id };
  }
  return null;
}

/**
 * The skill a price is asked through. Agents name it "negotiate", or
 * variants such as "negotiate-erc8183-job"; the exact "negotiate" wins when
 * both are declared. Returned as the agent declared it, so the request names
 * the skill the agent will route.
 */
export function negotiationSkillOf(skills: unknown[]): string | null {
  const ids = skills
    .map((skill) => object(skill))
    .map((skill) => (typeof skill?.id === 'string' ? skill.id : typeof skill?.name === 'string' ? skill.name : null))
    .filter((id): id is string => id !== null);
  return ids.find((id) => id === 'negotiate') ?? ids.find((id) => /^negotiate[-_]/i.test(id)) ?? null;
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
 * A refusal that says the agent's only callable skills are the escrow ones.
 *
 * Some agents do their work only inside a funded job: asked directly they
 * reply "unknown skill" and list `negotiate` and `notify_funded`. That is a
 * statement about how they sell, not a wrong answer, and recording it as a
 * failed check would misrepresent them.
 */
export function isPaidOnlyRefusal(answer: { data: Record<string, unknown> | null } | null): boolean {
  const data = answer?.data;
  if (!data || typeof data.error !== 'string' || !/unknown skill|unsupported skill|no such skill/i.test(data.error)) return false;
  const skills = Array.isArray(data.skills) ? data.skills.filter((s): s is string => typeof s === 'string') : [];
  return skills.length > 0 && skills.every((s) => PLUMBING.test(s));
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
