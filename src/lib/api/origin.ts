/**
 * The origin a caller reached us on, for building absolute links.
 *
 * Pure header parsing, deliberately free of `server-only` so the routes
 * that publish self-links can be tested as routes. It lived in
 * `api/respond`, which is `server-only` and pulls in the rate limiter, and
 * that put every route building a public link out of reach of the test
 * runner — which is how `/api/v1/integration` came to publish its own
 * preflight tools on `https://0.0.0.0:8080` in production without a single
 * test noticing.
 */

/** The origin a caller reached us on, for building absolute links. */
export function originOf(request: Request): string {
  /*
   * The public origin, not the socket we happen to be bound to.
   *
   * This read `new URL(request.url).origin`, which behind a proxy is the
   * internal address the container listens on — so every self-link this API
   * published came out as http://0.0.0.0:8080/…, including the ones handed to
   * BNB as the verification surface. The links were unusable and nothing in
   * the test suite could see it, because the value only goes wrong once there
   * is a proxy in front.
   *
   * Taken from the forwarded headers rather than an environment variable:
   * `NEXT_PUBLIC_*` is inlined at build time, so a value set in fly.toml at
   * runtime would not reliably reach this code, and a wrong absolute URL is
   * exactly the failure being fixed. The proxy always sends these.
   */
  const forwardedHost =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (forwardedHost) {
    const proto =
      request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
      (forwardedHost.startsWith('localhost') ? 'http' : 'https');
    return `${proto}://${forwardedHost.split(',')[0].trim()}`;
  }
  return new URL(request.url).origin;
}
