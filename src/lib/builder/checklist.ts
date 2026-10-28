/**
 * The builder's checklist from a draft to a hireable listing, one stage at
 * a time: identity, endpoint, compatible inputs, signed price, test
 * delivery, ready to publish.
 *
 * Each stage says what Pokter actually checked. A signed price cannot be
 * asked for before the agent is registered, so that stage says it is
 * checked after publishing rather than showing a tick it has not earned; a
 * test delivery is optional and says so. A failed stage carries the exact
 * reason Pokter got and the integration-kit section that fixes it.
 */
export type ChecklistStatus = 'done' | 'failed' | 'todo' | 'after-publish' | 'optional';

export interface ChecklistStage {
  id: 'identity' | 'endpoint' | 'inputs' | 'price' | 'test-delivery' | 'ready';
  label: string;
  status: ChecklistStatus;
  /** What Pokter saw, in a sentence; for a failure, the reason itself. */
  detail: string;
  fix: { label: string; href: string } | null;
}

export interface ChecklistInput {
  /** Name, description, category and image checks, as the form already runs them. */
  identity: { done: boolean; missing: string[] };
  endpoint: { checked: boolean; ok: boolean; detail: string | null; status: number | null; error?: string | null };
  /** Skills the endpoint's card declares. */
  capabilities: string[];
  /** Whether the card declares a negotiation skill a quote can be asked of (`isNegotiationSkill`). */
  quoteCapability: boolean;
  /** A skill named for pricing that Pokter does not ask, such as `get_quote`, when there is no negotiate skill. */
  priceLikeSkill?: string | null;
  trial: { ran: boolean; ok: boolean; summary: string | null; error: string | null };
}

const KIT = '/build/integration';
const fix = (anchor: string, label: string) => ({ label, href: `${KIT}#${anchor}` });
/* Skills about pricing rather than work, left out of "skills a buyer can hire". Whether one can be asked for a quote is `isNegotiationSkill`, which is narrower. */
const QUOTE_SKILL = /(?:negotiate|quote|price)/i;

export function builderChecklist(input: ChecklistInput): ChecklistStage[] {
  const identity: ChecklistStage = input.identity.done
    ? { id: 'identity', label: 'Identity', status: 'done', detail: 'Name, description, category and image are set.', fix: null }
    : { id: 'identity', label: 'Identity', status: 'todo', detail: `Still to set: ${input.identity.missing.join(', ') || 'the details above'}.`, fix: fix('identity', 'What a listing needs') };

  const endpoint: ChecklistStage = input.endpoint.error && !input.endpoint.checked
    ? { id: 'endpoint', label: 'Endpoint', status: 'failed', detail: `The check could not run: ${input.endpoint.error}`, fix: fix('transports', 'Fix the endpoint') }
    : !input.endpoint.checked
    ? { id: 'endpoint', label: 'Endpoint', status: 'todo', detail: 'Not checked yet. Pokter calls it the way a hire would.', fix: null }
    : input.endpoint.ok
      ? { id: 'endpoint', label: 'Endpoint', status: 'done', detail: 'It answered Pokter’s check the way a hire would call it.', fix: null }
      : {
          id: 'endpoint',
          label: 'Endpoint',
          status: 'failed',
          detail: `${input.endpoint.detail || 'It did not answer.'}${input.endpoint.status ? ` (HTTP ${input.endpoint.status})` : ''}`,
          fix: fix('transports', 'Fix the endpoint'),
        };

  const work = input.capabilities.filter((c) => !QUOTE_SKILL.test(c));
  const inputs: ChecklistStage = !input.endpoint.ok
    ? { id: 'inputs', label: 'Compatible inputs', status: 'todo', detail: 'Read from the endpoint once it answers.', fix: null }
    : work.length > 0
      ? { id: 'inputs', label: 'Compatible inputs', status: 'done', detail: `Declares ${work.length === 1 ? 'a skill' : `${work.length} skills`} a buyer can hire: ${work.slice(0, 4).join(', ')}.`, fix: null }
      : { id: 'inputs', label: 'Compatible inputs', status: 'failed', detail: 'The card declares no skill a buyer could hire, so no brief can be addressed to it.', fix: fix('skills', 'Declare a skill') };

  const price: ChecklistStage = !input.endpoint.ok
    ? { id: 'price', label: 'Signed price', status: 'todo', detail: 'Read from the endpoint once it answers.', fix: null }
    : input.quoteCapability
      ? { id: 'price', label: 'Signed price', status: 'after-publish', detail: 'It declares a negotiation skill. Pokter asks it for a signed price after you publish, because a quote is bound to a registered identity.', fix: null }
      : input.priceLikeSkill
        ? { id: 'price', label: 'Signed price', status: 'failed', detail: `It declares “${input.priceLikeSkill}”, but Pokter asks for a price only through a skill with the id negotiate (or negotiate-…). Rename it, or add one, so buyers’ briefs reach it.`, fix: fix('quote', 'Name the quote skill negotiate') }
        : { id: 'price', label: 'Signed price', status: 'failed', detail: 'It declares no negotiation skill, so it cannot sign a price for a buyer’s brief. Buyers can then only reach it on a budget they set, which it may decline.', fix: fix('quote', 'Add a quote skill') };

  const testDelivery: ChecklistStage = !input.trial.ran
    ? { id: 'test-delivery', label: 'Test delivery', status: 'optional', detail: 'Optional: run one free preview to see what a buyer would receive.', fix: null }
    : input.trial.ok
      ? { id: 'test-delivery', label: 'Test delivery', status: 'done', detail: input.trial.summary || 'The preview answered.', fix: null }
      : { id: 'test-delivery', label: 'Test delivery', status: 'failed', detail: input.trial.error || input.trial.summary || 'The preview did not answer.', fix: fix('delivery', 'How a delivery works') };

  const blocking = [identity, endpoint, inputs, price].filter((s) => s.status === 'todo' || s.status === 'failed');
  const ready: ChecklistStage = blocking.length === 0
    ? { id: 'ready', label: 'Ready to publish', status: 'done', detail: 'Everything Pokter can check before registration has passed.', fix: null }
    : { id: 'ready', label: 'Ready to publish', status: 'todo', detail: `Still open: ${blocking.map((s) => s.label.toLowerCase()).join(', ')}.`, fix: null };

  return [identity, endpoint, inputs, price, testDelivery, ready];
}
