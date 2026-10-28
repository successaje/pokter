import { readA2AReply } from '@/lib/a2a/reply';

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
/*
 * Escrow plumbing as well as liveness: `erc8183-job-status` is declared
 * before the work skill on every one of one operator's agent cards, and
 * the free check sent it health-factor and grid briefs, then published the
 * error it returned ("requires an integer 'job_id'") as a failed answer.
 */
const PLUMBING = /negotiat|notify|^quote$|^ping$|^health$|^healthcheck$|^status$|job[-_ ]?status|^erc-?8183[-_]/i;

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

/** Words a category's work skill is named or described with. */
const CATEGORY_WORDS: Record<string, RegExp> = {
  'health-factor': /health|liquidat|venus|lending|loan|collateral/i,
  'grid-trading': /grid/i,
  yield: /yield|apy|apr|supply rate/i,
  rebalancing: /rebalanc|range|position|lp\b|liquidity/i,
  'token-safety': /token|honeypot|safety|scam|tax/i,
};

/**
 * The skill a brief is sent to. Of the skills that are not plumbing, the
 * first that names the agent's category when one is given, else the first.
 * An operator serving several agents from one card lists every work skill on
 * it, and the first is rarely the one this agent is listed for. Null when
 * the card declares nothing usable, which the caller treats as "cannot be
 * asked", not as "ask anyway".
 */
export function pickWorkSkill(skills: unknown, category?: string): SkillChoice | null {
  if (!Array.isArray(skills)) return null;
  const work: Array<SkillChoice & { words: string }> = [];
  for (const entry of skills) {
    const skill = object(entry);
    const id = typeof skill?.id === 'string' ? skill.id : typeof skill?.name === 'string' ? skill.name : null;
    if (!id) continue;
    const words = `${id} ${typeof skill?.name === 'string' ? skill.name : ''} ${typeof skill?.description === 'string' ? skill.description : ''}`;
    if (PLUMBING.test(id) && !(AMBIGUOUS.test(id) && DESCRIBES_WORK.test(words))) continue;
    work.push({ id, name: typeof skill?.name === 'string' ? skill.name : id, words });
  }
  const pattern = category ? CATEGORY_WORDS[category] : undefined;
  const chosen = (pattern && work.find((skill) => pattern.test(skill.words))) ?? work[0];
  return chosen ? { id: chosen.id, name: chosen.name } : null;
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
  return ids.find((id) => id === 'negotiate') ?? ids.find(isNegotiationSkill) ?? null;
}

/**
 * Whether a skill id is one Pokter asks for a price through: `negotiate`,
 * or `negotiate-…` / `negotiate_…`, the convention of BNB's agent SDK.
 *
 * The one rule, for the quote request and for the builder's preflight.
 * Preflight said "declares a negotiation skill" for anything containing
 * negotiate, quote or price, so a `get_quote` skill passed it and was then
 * never asked: the builder was told one thing and the requester did another.
 */
export function isNegotiationSkill(id: string): boolean {
  return id === 'negotiate' || /^negotiate[-_]/i.test(id);
}

/** A skill that sounds like pricing but is not one Pokter asks (`get_quote`, `price`), so its builder can be told why. */
export function priceLikeSkill(ids: string[]): string | null {
  if (ids.some(isNegotiationSkill)) return null;
  return ids.find((id) => /(?:negotiat|quote|pric)/i.test(id)) ?? null;
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
 * A free preview that names a price instead of doing the work.
 *
 * Pokter's own agents answer a direct call with `preview: true`: whether
 * the brief can be answered, and what it costs through escrow. Brinkwatch's
 * health factor check graded that preview as three unreadable answers and
 * published "matched 0 of 3", a failure the agent had not earned: it had
 * said, correctly, that the answer is sold, not that it could not give one.
 */
function isPricedPreview(data: Record<string, unknown>): boolean {
  return data.preview === true && ('price_u' in data || 'price' in data);
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
  if (data && isPricedPreview(data)) return true;
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
  // Only a final reply is an answer: a working, failed or input-required task is not.
  const reply = readA2AReply(payload);
  if (reply.kind === 'task' && reply.state !== 'completed') return null;
  const data = reply.data && !isQuoteReply(reply.data) ? reply.data : null;
  if (reply.texts.length === 0 && !data) return null;
  return { text: reply.texts.length ? reply.texts.join('\n\n') : null, data };
}
