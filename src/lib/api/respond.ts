import 'server-only';

import { NextResponse } from 'next/server';

import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

/**
 * Shared behaviour for the public read API.
 *
 * CORS is open because the whole point is that anything can read it — an agent
 * shopping for another agent has no origin to allow-list. Only GET is exposed,
 * so an open policy grants nothing a caller could not get with curl.
 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
} as const;

export function apiJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...CORS,
      /*
       * Short and shared. The underlying data moves on a sweep cycle, not per
       * request, so a caller polling every second should be served a cached
       * copy rather than made to feel fast while costing a registry lookup.
       */
      'cache-control': 'public, max-age=30, s-maxage=30, stale-while-revalidate=120',
    },
  });
}

export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: CORS });
}

export function apiOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Returns a 429 response when the caller has run out, or null to proceed. */
export function apiRateLimit(
  request: Request,
  scope: string,
  limit = 60,
): NextResponse | null {
  const rate = consumeRateLimit(`api:${scope}:${requestClientKey(request)}`, {
    limit,
    windowMs: 60_000,
  });
  if (rate.allowed) return null;
  return NextResponse.json(
    { error: 'Rate limit exceeded.', retryAfterSeconds: rate.retryAfterSeconds },
    {
      status: 429,
      headers: { ...CORS, 'retry-after': String(rate.retryAfterSeconds) },
    },
  );
}

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
