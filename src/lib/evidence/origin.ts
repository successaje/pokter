/**
 * The public origin this agent advertises.
 *
 * An agent card that names localhost is a card no marketplace can probe,
 * and `NEXT_PUBLIC_APP_URL` is compiled in at build time — which is the
 * same variable, and the same build-arg plumbing, that silently resolved
 * to undefined once already. The fallback is the live host rather than a
 * development one for that reason: wrong-but-reachable beats
 * unreachable when the consumer is somebody else's prober.
 */
export function siteOrigin(): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return new URL(configured || 'https://pokter.xyz');
}
