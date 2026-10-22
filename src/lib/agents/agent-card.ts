import 'server-only';

import { readJson, withPublicEndpoint } from '@/lib/proof/prober';
import { declaredCapabilities, type DeclaredSkill } from './capabilities';
import { negotiationSkillOf } from '@/lib/erc8183/courier-parse';
import { readCardThrough, type CardProblem } from './card-read';

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
 *
 * The two steps and what each outcome means live in `readCardThrough`, which
 * is pure and tested against a real server; this supplies the one transport
 * agents are ever called through. The thrown message says which kind of
 * nothing came back, because `classifyQuoteError` reads it to tell a buyer
 * whether to try again.
 */
export async function readAgentCard(endpoint: string, { timeoutMs = 8_000 }: { timeoutMs?: number } = {}): Promise<Record<string, unknown>> {
  const read = await readCardThrough(endpoint, (url) => fetchJson(url, timeoutMs));
  if (read.ok) return read.card;
  throw new Error(read.message);
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
 * Three of the four problems do not change by asking again: no A2A endpoint
 * registered, a card that names no interface, a card with no negotiate
 * skill. The fourth, `card-unreadable`, is the read failing rather than a
 * fact about the agent, and it is reported as its own problem instead of as
 * none: a page that said nothing left the default budget and a hire button
 * in place, and a page that called it "no interface" told a builder their
 * agent was unconnected over one slow lookup. It carries a transient
 * blocker, so no hire path is withdrawn on it.
 */
export async function readCardForPage(
  endpoint: string | null | undefined,
  tokenId: string,
): Promise<{ skills: DeclaredSkill[]; problem: CardProblem | null }> {
  if (!endpoint) return { skills: [], problem: 'no-endpoint' };
  const resolved = endpoint.replace('{agentId}', tokenId);
  let read: Awaited<ReturnType<typeof readCardThrough>>;
  try {
    read = await readCardThrough(resolved, (url) => fetchJson(url, 2_500));
  } catch {
    /* The endpoint Pokter was told to call did not answer: nothing is known. */
    return { skills: [], problem: 'card-unreadable' };
  }
  if (!read.ok) {
    return { skills: [], problem: read.problem === 'no-interface' ? 'card-without-interface' : 'card-unreadable' };
  }
  const skills = Array.isArray(read.card.skills) ? read.card.skills : [];
  return { skills: declaredCapabilities(read.card.skills), problem: negotiationSkillOf(skills) ? null : 'no-price-skill' };
}
