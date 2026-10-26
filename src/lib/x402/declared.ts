import 'server-only';

import { x402EndpointFor } from './seller';

/**
 * Whether an agent's registration declares a pay-per-call (x402) endpoint.
 *
 * Read from the registration itself (the same guarded read the x402 panel
 * uses), never from the endpoint: nothing is called or paid, so a declaration
 * says the agent names one, not that it answers or what it charges. That is
 * all the agent page says with it while x402 is off.
 *
 * Cached per agent, because the page asks on every view and the read can
 * take seconds. A declaration is kept longer than its absence, which may be
 * a registration that did not answer this time. A read that threw is not
 * cached at all.
 */
const DECLARED_FOR_MS = 6 * 3_600_000;
const ABSENT_FOR_MS = 3_600_000;
const cache = new Map<string, { declared: boolean; until: number }>();

export async function declaresPayPerCall(chainId: number, tokenId: string): Promise<boolean | null> {
  const key = `${chainId}:${tokenId}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.declared;
  try {
    const declared = (await x402EndpointFor(chainId, tokenId)) !== null;
    cache.set(key, { declared, until: Date.now() + (declared ? DECLARED_FOR_MS : ABSENT_FOR_MS) });
    return declared;
  } catch {
    return null;
  }
}
