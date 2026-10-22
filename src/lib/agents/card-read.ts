import { a2aCardFallback } from '@/lib/proof/card-access';
import { cardWithoutInterface, isAgentCard } from '@/lib/a2a/card';

/**
 * Reading an agent's card, and the difference between an agent that names no
 * interface and a card Pokter could not read.
 *
 * Both used to arrive as the same thing. `readAgentCard` tries the registered
 * endpoint and then the card's own well-known location, and threw
 * "The endpoint answered, but not with an agent card" whenever the first URL
 * answered 200 — whatever happened at the second. So an agent whose homepage
 * returns an index and whose card then timed out or answered 503 was reported
 * as permanently having no interface: the page told its builder the operator
 * had listed it without connecting a running agent, and the buyer's quote
 * failed 409, not retryable. One slow minute, read as a closed door.
 *
 * Absence of a card is not evidence of absence of an interface, so the result
 * says which it is rather than leaving the caller to infer it from a null.
 * `no-interface` is only ever returned for something Pokter actually read.
 *
 * Pure, and the transport is the caller's: the guarded, address-pinned
 * fetcher in production (`agent-card.ts`), a server the test owns in
 * `tests/card-problem-blocker.test.mts`.
 */

/** One HTTP read of a candidate card location. Throws only for the first. */
export type CardFetch = (url: string) => Promise<{ status: number; body: unknown }>;

/**
 * Why no card came back.
 *
 * `no-interface` holds until the operator changes something. `unreadable`
 * says nothing about the agent at all, so no caller may turn it into a
 * permanent claim about one.
 */
export type CardReadProblem = 'no-interface' | 'unreadable';

export type CardRead =
  | { ok: true; card: Record<string, unknown> }
  | { ok: false; problem: CardReadProblem; message: string };

/**
 * The sentence `readAgentCard` has always thrown for this case, kept
 * verbatim: `classifyQuoteError` matches it to decide that a buyer's quote
 * failure is the agent's listing rather than the network.
 */
const NAMES_NO_INTERFACE = 'The endpoint answered, but not with an agent card.';

const describe = (error: unknown) => (error instanceof Error ? `${error.name} ${error.message}` : String(error));

type Attempt = { answered: true; status: number; body: unknown } | { answered: false; why: string };

/**
 * One read of the card's own location, and whether it answered the question.
 *
 * A 2xx body can be judged, and so can 404 or 410: the card is not there,
 * and asking again will not put it there. Everything else — a refused
 * connection, a timeout, 429, 5xx — is the lookup failing, which is not an
 * answer about the agent's interface.
 */
async function attempt(url: string, fetchJson: CardFetch): Promise<Attempt> {
  let answer: { status: number; body: unknown };
  try {
    answer = await fetchJson(url);
  } catch (error) {
    return { answered: false, why: `${url} could not be read: ${describe(error)}` };
  }
  if (answer.status >= 200 && answer.status < 300) return { answered: true, ...answer };
  if (answer.status === 404 || answer.status === 410) return { answered: true, status: answer.status, body: null };
  return { answered: false, why: `${url} answered ${answer.status}.` };
}

/**
 * The card at an endpoint, or which kind of nothing came back.
 *
 * The first read's own failure is thrown rather than classified: the error
 * from the endpoint Pokter was told to call is the most informative thing
 * there is, and every caller already reads it.
 */
export async function readCardThrough(endpoint: string, fetchJson: CardFetch): Promise<CardRead> {
  const first = await fetchJson(endpoint);
  if (isAgentCard(first.body)) return { ok: true, card: first.body };

  const cardUrl = a2aCardFallback(endpoint, first.body);
  const second = cardUrl ? await attempt(cardUrl, fetchJson) : null;
  if (second?.answered && isAgentCard(second.body)) return { ok: true, card: second.body };

  /*
   * A card document Pokter read that declares no interface settles it, even
   * if the other location then failed: this is the fact itself, not an
   * inference from a missing answer (hwayongjin.agent, 56:300282, whose
   * platform reports UNBOUND, offline, endpoint null).
   */
  if (cardWithoutInterface(first.body) || (second?.answered && cardWithoutInterface(second.body))) {
    return { ok: false, problem: 'no-interface', message: NAMES_NO_INTERFACE };
  }

  /* The endpoint itself refused or failed: its status is what happened. */
  if (first.status < 200 || first.status >= 300) {
    return { ok: false, problem: 'unreadable', message: `The agent card answered ${first.status}.` };
  }

  /*
   * The endpoint answered with something that is not a card, so only the
   * card's own location can settle it — and it has to have answered. This
   * is the read that used to be reported as "no interface".
   */
  if (second && !second.answered) {
    return { ok: false, problem: 'unreadable', message: `The agent card at ${second.why}` };
  }

  /* Looked everywhere Pokter looks, and every look answered. */
  return { ok: false, problem: 'no-interface', message: NAMES_NO_INTERFACE };
}

/**
 * What a page's own card read found, in the terms a hire blocker is built
 * from. `card-unreadable` is the one that must never be mistaken for the
 * others: see `blockerCodeForCardProblem`.
 */
export type CardProblem = 'no-endpoint' | 'card-without-interface' | 'no-price-skill' | 'card-unreadable';

/**
 * The `hireBlocker` input a card read implies.
 *
 * `card-unreadable` gets its own code rather than a transient `no-endpoint`
 * on purpose. "No endpoint" is a claim about the agent; this is a claim
 * about the check, and the hire panel reads the code to decide whether to
 * withdraw the hire buttons — which it must not do over a failed lookup.
 */
export function blockerCodeForCardProblem(problem: CardProblem): { code: string; detail: string | null } {
  switch (problem) {
    case 'card-without-interface':
      return { code: 'no-endpoint', detail: 'card-without-interface' };
    case 'card-unreadable':
      return { code: 'card-unreadable', detail: null };
    default:
      return { code: problem, detail: null };
  }
}
