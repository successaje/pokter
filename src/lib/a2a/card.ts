/**
 * Where an A2A agent can be called, read from either card format.
 *
 * Cards up to v0.3 put the endpoint in a top-level `url`, with its transport
 * in `preferredTransport` (JSON-RPC when absent) and others in
 * `additionalInterfaces`. Current cards list `supportedInterfaces`, each
 * with a `url` and a `protocolBinding`, and may have no top-level `url`.
 * Pokter called `card.url` with JSON-RPC whatever the card said, so a card
 * whose top-level URL was gRPC or HTTP+JSON got a request it could not
 * read, and a current card without a top-level URL could not be called.
 *
 * Pokter speaks JSON-RPC over HTTPS, so it picks the first interface the
 * card declares in that binding, and says so when there is none.
 */

export interface A2AInterface {
  url: string;
  binding: string;
  version: string | null;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const JSONRPC = /^json-?rpc(?:\s*2\.0)?$/i;

/** Every interface the card declares, in its own order of preference. */
export function a2aInterfaces(card: unknown): A2AInterface[] {
  const c = object(card);
  if (!c) return [];
  const found: A2AInterface[] = [];
  const add = (url: unknown, binding: unknown, version: unknown) => {
    if (typeof url !== 'string' || !url) return;
    found.push({ url, binding: typeof binding === 'string' && binding ? binding : 'JSONRPC', version: typeof version === 'string' ? version : null });
  };
  if (Array.isArray(c.supportedInterfaces)) {
    for (const entry of c.supportedInterfaces) {
      const i = object(entry);
      add(i?.url, i?.protocolBinding ?? i?.transport, i?.protocolVersion);
    }
  }
  add(c.url, c.preferredTransport, c.protocolVersion);
  if (Array.isArray(c.additionalInterfaces)) {
    for (const entry of c.additionalInterfaces) {
      const i = object(entry);
      add(i?.url, i?.transport ?? i?.protocolBinding, c.protocolVersion);
    }
  }
  const seen = new Set<string>();
  return found.filter((i) => {
    const key = `${i.binding.toUpperCase()} ${i.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The HTTPS JSON-RPC endpoint Pokter can call, or null when the card offers none. */
export function jsonRpcEndpoint(card: unknown): string | null {
  return a2aInterfaces(card).find((i) => JSONRPC.test(i.binding) && i.url.startsWith('https://'))?.url ?? null;
}

/** Whether a body is an agent card at all, in either format. */
export function isAgentCard(body: unknown): body is Record<string, unknown> {
  const c = object(body);
  return Boolean(c && typeof c.name === 'string' && Array.isArray(c.skills) && a2aInterfaces(c).length > 0);
}

/**
 * A card in every respect except a callable interface: `isAgentCard` minus
 * the one thing it also requires.
 *
 * This is the only shape that proves an agent names nowhere to send a brief,
 * as opposed to Pokter failing to find out. `isAgentCard` returns false for
 * both — for this and for a timeout — and a caller that reads the one as the
 * other tells a builder their agent is unconnected because a lookup was slow.
 * A service index is not this: `{ name, agentCard: '/…' }` carries a name and
 * no skills, so the two stay apart.
 */
export function cardWithoutInterface(body: unknown): boolean {
  const c = object(body);
  return Boolean(c && typeof c.name === 'string' && Array.isArray(c.skills) && a2aInterfaces(c).length === 0);
}
