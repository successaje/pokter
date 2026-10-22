import 'server-only';

import { a2aCardFallback } from '@/lib/proof/card-access';
import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import { declaredCapabilities, type DeclaredSkill } from './capabilities';
import { negotiationSkillOf } from '@/lib/erc8183/courier-parse';
import { isAgentCard } from '@/lib/a2a/card';

/**
 * Reads an agent's own Agent Card and returns the capabilities it advertises.
 *
 * Fetched through `withPublicEndpoint`, the same guarded fetcher the prober
 * and the trial use: the endpoint is pinned to a public address, the body is
 * size-capped and redirects are refused. An agent endpoint is a third party
 * and is treated as one.
 *
 * Never throws and never blocks the page. A card that is slow, missing,
 * malformed or hostile returns an empty list and the caller falls back to
 * the registry description — which is what every agent showed before this
 * existed, so the failure mode is simply the old behaviour.
 *
 * The timeout is deliberately shorter than the prober's. This runs while
 * somebody is waiting for a page, not inside a sweep. Of the 66 listed
 * agents that publish an endpoint, 53 answer; the other 13 would hold the
 * page for however long this waits, and a capability line is not worth
 * several seconds of blank heading. A healthy card comes back well inside
 * a second — the live negotiation trial against the same endpoints
 * completes in under one — so 2.5s accepts the ones that work and gives up
 * quickly on the ones that do not.
 */
/** A card in either format: a top-level url, or supportedInterfaces (see `a2aInterfaces`). */
function isCard(body: unknown): body is Record<string, unknown> {
  return isAgentCard(body);
}

async function fetchJson(url: string, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  return withPublicEndpoint(url, async (handle) => {
    const response = await handle.fetch({
      headers: { accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: response.status, body: response.ok ? await readJson(response).catch(() => null) : null };
  });
}

/**
 * An agent's A2A card, read the way the prober reads it.
 *
 * The URL given is tried first; if it answers with something other than a
 * card (a service's base URL, an index page), the card's location is tried
 * once (`a2aCardFallback`). Every path that talks to an agent reads its card
 * through this, so an agent that passes Pokter's check can also be quoted,
 * asked and hired. Throws when neither yields a card.
 */
export async function readAgentCard(endpoint: string, { timeoutMs = 8_000 }: { timeoutMs?: number } = {}): Promise<Record<string, unknown>> {
  const first = await fetchJson(endpoint, timeoutMs);
  if (isCard(first.body)) return first.body;
  const fallback = a2aCardFallback(endpoint, first.body);
  if (fallback) {
    const second = await fetchJson(fallback, timeoutMs).catch(() => null);
    if (second && isCard(second.body)) return second.body;
  }
  throw new Error(first.status >= 200 && first.status < 300 ? 'The endpoint answered, but not with an agent card.' : `The agent card answered ${first.status}.`);
}

export async function fetchDeclaredCapabilities(
  endpoint: string | null | undefined,
  tokenId: string,
): Promise<DeclaredSkill[]> {
  return (await readCardForPage(endpoint, tokenId)).skills;
}

/**
 * What an agent's card says about whether it can be hired, as a permanent
 * fact or not at all.
 *
 * The sweep stores a hire blocker for the agents it reaches, which is the
 * DeFi categories and the top of the registry. Every other agent's page
 * showed no blocker and offered a hire at the default budget, and the
 * reason only appeared when a buyer tried: hwayongjin.agent (56:300282),
 * whose card answers with no service to send a brief to. The page already
 * reads the card, once per view, for its skills; this is the same read,
 * now also saying what it found.
 *
 * Only facts that do not change by asking again become a problem: no A2A
 * endpoint registered, a card that names no interface, a card with no
 * negotiate skill. A card that did not answer this time is not a problem
 * here (it may be a passing outage), so it never blocks a hire on one read.
 */
export type CardProblem = 'no-endpoint' | 'card-without-interface' | 'no-price-skill';

export async function readCardForPage(
  endpoint: string | null | undefined,
  tokenId: string,
): Promise<{ skills: DeclaredSkill[]; problem: CardProblem | null }> {
  if (!endpoint) return { skills: [], problem: 'no-endpoint' };
  const resolved = endpoint.replace('{agentId}', tokenId);
  try {
    const card = await readAgentCard(resolved, { timeoutMs: 2_500 });
    const skills = Array.isArray(card.skills) ? card.skills : [];
    return { skills: declaredCapabilities(card.skills), problem: negotiationSkillOf(skills) ? null : 'no-price-skill' };
  } catch (error) {
    return { skills: [], problem: /answered, but not with an agent card/i.test((error as Error)?.message ?? '') ? 'card-without-interface' : null };
  }
}
