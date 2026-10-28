/**
 * An https endpoint an agent registered under a service name, from its
 * ERC-8004 registration file: `services` (or the older `endpoints`), each
 * `{ name, endpoint }`. Read from the registration the owner signed, so it
 * can stand in when an indexer's copy is missing.
 */
export function registeredServiceEndpoint(file: unknown, serviceName: string): string | null {
  if (typeof file !== 'object' || file === null) return null;
  const record = file as { services?: unknown; endpoints?: unknown };
  const services = Array.isArray(record.services) ? record.services : Array.isArray(record.endpoints) ? record.endpoints : [];
  for (const service of services) {
    if (typeof service !== 'object' || service === null) continue;
    const { name, endpoint } = service as { name?: unknown; endpoint?: unknown };
    if (typeof name !== 'string' || name.trim().toLowerCase() !== serviceName.toLowerCase() || typeof endpoint !== 'string') continue;
    try {
      const url = new URL(endpoint);
      if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
    } catch {
      /* Not a URL: not an endpoint. */
    }
  }
  return null;
}

/**
 * The x402 endpoint an agent registered, from its ERC-8004 registration.
 *
 * Read from the registration the owner signed rather than from the
 * indexer, which does not carry it. Only an https URL on a service named
 * "x402" counts; an agent that declares none is simply not offered.
 */
export function x402EndpointFromRegistration(file: unknown): string | null {
  return registeredServiceEndpoint(file, 'x402');
}

/** The registration file from a token URI: inline `data:` JSON, or null for anything else (fetched by the caller). */
export function registrationFromDataUri(uri: string): unknown {
  if (!uri.startsWith('data:')) return null;
  const comma = uri.indexOf(',');
  if (comma < 0) return null;
  try {
    const body = uri.slice(comma + 1);
    return JSON.parse(uri.slice(0, comma).includes(';base64') ? Buffer.from(body, 'base64').toString('utf8') : decodeURIComponent(body));
  } catch {
    return null;
  }
}
